import { join } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ContinuousModelingService } from "./application/continuousModeling/continuousModelingService";
import { ContinuousModelingWorkspaceService } from "./application/continuousModeling/continuousModelingWorkspaceService";
import { OpenclawGlobalService } from "./application/openclawGlobal/openclawGlobalService";
import { PlatformService } from "./application/platform/platformService";
import { createAgentRunnerFromEnv, probeLlmRuntimeStatus } from "./application/workspace/agentRunner";
import { extractKnowledgeBaseUpdateOp } from "./application/workspace/ontologyService";
import { buildModelingInputFromAnalysis } from "./application/workspace/ontologyModelingBridge";
import { syncAllProjectWorkspaceKnowledge, syncProjectWorkspaceKnowledge } from "./application/workspace/projectWorkspaceKnowledgeService";
import { WorkspaceService } from "./application/workspace/workspaceService";
import type { WorkspaceRepository } from "./domain/workspace/repository";
import { JsonContinuousModelingRepository } from "./infrastructure/persistence/jsonContinuousModelingRepository";
import { JsonOpenclawGlobalRepository } from "./infrastructure/persistence/jsonOpenclawGlobalRepository";
import { JsonWorkspaceRepository } from "./infrastructure/persistence/jsonWorkspaceRepository";
import { SqliteRevokedTokenStore } from "./infrastructure/persistence/sqliteRevokedTokenStore";
import { SqliteWorkspaceRepository } from "./infrastructure/persistence/sqliteWorkspaceRepository";
import { setRevokedTokenStore } from "./infrastructure/runtime/jwt";
import { createLogger } from "./infrastructure/runtime/logger";
import { resolveCorsOriginOption } from "./infrastructure/runtime/runtimeCors";
import { probeRuntimeDependencies } from "./infrastructure/runtime/runtimeDependencyProbe";
import { registerRuntimeAuth } from "./infrastructure/runtime/runtimeAuth";
import { registerRuntimeHooks } from "./infrastructure/runtime/runtimeHooks";
import { loadRuntimeConfig } from "./infrastructure/runtime/runtimeConfig";
import { registerGracefulShutdown } from "./infrastructure/runtime/runtimeShutdown";
import { RuntimeState } from "./infrastructure/runtime/runtimeState";
import { registerAuthRoutes } from "./interfaces/http/routes/authRoutes";
import { registerContinuousModelingRoutes } from "./interfaces/http/routes/continuousModelingRoutes";
import { registerOpenclawGlobalRoutes } from "./interfaces/http/routes/openclawGlobalRoutes";
import { registerPlatformRoutes } from "./interfaces/http/routes/platformRoutes";
import { registerRepositoryTraceRoutes } from "./interfaces/http/routes/repositoryTraceRoutes";
import { registerSystemRoutes } from "./interfaces/http/routes/systemRoutes";
import { registerWorkspaceRoutes } from "./interfaces/http/routes/workspaceRoutes";

type CreateBuildwiseAppOptions = {
  env: Record<string, string | undefined>;
  dataFile?: string;
  registerProcessHandlers?: boolean;
  scheduleWorkspaceRefresh?: boolean;
  syncWorkspaceKnowledgeOnStart?: boolean;
  probeLlmOnStart?: boolean;
};

type BuildwiseProcessHooks = {
  on: (event: string, handler: () => void) => void;
  exit: (code?: number) => void;
};

export type BuildwiseAppContext = {
  app: ReturnType<typeof Fastify>;
  config: ReturnType<typeof loadRuntimeConfig>;
  runtime: RuntimeState;
  workspaceRepo: WorkspaceRepository;
  workspaceService: WorkspaceService;
  platformService: PlatformService;
  refreshLlmRuntimeStatus: () => Promise<void>;
  startBackgroundTasks: () => void;
};

function resolveProcessHooks() {
  return ((globalThis as { process?: BuildwiseProcessHooks }).process ?? {
    on: () => {},
    exit: () => {}
  }) as BuildwiseProcessHooks;
}

async function refreshLlmRuntimeStatus(runtime: RuntimeState, env: Record<string, string | undefined>) {
  const log = createLogger("bootstrap");
  const llmStatus = await probeLlmRuntimeStatus(env);
  runtime.setLlmStatus(llmStatus);
  log.info("llm probe completed", {
    configured: llmStatus.configured,
    reachable: llmStatus.reachable,
    base: llmStatus.baseUrl || "n/a",
    model: llmStatus.model,
    error: llmStatus.error || "none"
  });
}

function scheduleDailyProjectWorkspaceRefresh(workspaceRepo: WorkspaceRepository) {
  const log = createLogger("workspace-memory");
  const scheduleNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const delayMs = Math.max(60_000, next.getTime() - now.getTime());
    setTimeout(() => {
      try {
        const results = syncAllProjectWorkspaceKnowledge(workspaceRepo);
        log.info("daily project workspace memory refresh completed", { projects: results.length });
      } catch (error) {
        log.error("daily project workspace memory refresh failed", { error: error instanceof Error ? error.message : String(error) });
      } finally {
        scheduleNext();
      }
    }, delayMs).unref();
  };
  scheduleNext();
}

export async function createBuildwiseApp(options: CreateBuildwiseAppOptions): Promise<BuildwiseAppContext> {
  const log = createLogger("bootstrap");
  const backendRoot = join(__dirname, "..");
  const config = loadRuntimeConfig(options.env, {
    dataFile: options.dataFile || join(backendRoot, "data.runtime.json")
  });
  const runtime = new RuntimeState(config);
  const app = Fastify({ logger: false });
  registerRuntimeHooks(app, runtime, config);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"]
      }
    },
    crossOriginEmbedderPolicy: false
  });
  await app.register(cors, { origin: resolveCorsOriginOption(config.corsOrigins), credentials: true });
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs
  });
  registerRuntimeAuth(app, config);
  if (options.registerProcessHandlers !== false) {
    registerGracefulShutdown(app, runtime, config, resolveProcessHooks());
  }
  app.get("/", async () => ({
    service: config.serviceName,
    status: "ok"
  }));

  const agentRunner = createAgentRunnerFromEnv(options.env);
  const dependencyStatus = await probeRuntimeDependencies(config);
  runtime.setDependencyStatus(dependencyStatus);
  log.info("dependency probe completed", { storage: dependencyStatus.storage.healthy, required: config.dependencyRequired });
  const workspaceRepo =
    config.storageBackend === "sqlite"
      ? new SqliteWorkspaceRepository(config.workspaceDbFile, config.dataFile, {
          bootstrapMode: config.allowSeedDataBootstrap ? "seed" : "empty"
        })
      : new JsonWorkspaceRepository(config.dataFile, {
          bootstrapMode: config.allowSeedDataBootstrap ? "seed" : "empty"
        });
  if (config.storageBackend === "sqlite" && workspaceRepo instanceof SqliteWorkspaceRepository) {
    setRevokedTokenStore(new SqliteRevokedTokenStore(workspaceRepo.getDb()));
  }
  const continuousModelingRepo = new JsonContinuousModelingRepository(join(backendRoot, "continuous-modeling.runtime.json"));
  const workspaceService = new WorkspaceService(workspaceRepo, agentRunner, continuousModelingRepo);
  const platformService = new PlatformService(workspaceRepo);
  const continuousModelingService = new ContinuousModelingService(continuousModelingRepo);
  const continuousModelingWorkspaceService = new ContinuousModelingWorkspaceService(continuousModelingService, workspaceRepo, continuousModelingRepo);
  const openclawGlobalRepo = new JsonOpenclawGlobalRepository(join(backendRoot, "openclaw-global.runtime.json"));
  const openclawGlobalService = new OpenclawGlobalService(openclawGlobalRepo, agentRunner, workspaceRepo);

  const emptyKb = (): { ontologyTerms: never[]; stableRules: never[]; componentInventory: never[]; codeMap: never[]; decisionLog: never[]; knownRisks: never[]; changePatterns: never[]; updatedAt: string } => ({
    ontologyTerms: [],
    stableRules: [],
    componentInventory: [],
    codeMap: [],
    decisionLog: [],
    knownRisks: [],
    changePatterns: [],
    updatedAt: ""
  });
  workspaceService.analysis.setOnAnalysisCompleted((iterationId, report) => {
    const iteration = workspaceRepo.findIteration(iterationId);
    if (!iteration) return;
    const projectId = iteration.projectId;
    const project = workspaceRepo.findProject(projectId);
    const dk = report.domainKnowledge;
    const domainEntries = dk.terms.map((t) => ({
      term: t.term,
      definition: t.definition,
      mappedPages: t.mappedTo.pages || [],
      mappedApis: t.mappedTo.apis || [],
      mappedEntities: t.mappedTo.entities || [],
      mappedCodePaths: t.mappedTo.codePaths || [],
      evidence: t.evidence
    }));

    if (project) {
      const existingKb = project.knowledgeBase ?? emptyKb();
      const ontologyResult = extractKnowledgeBaseUpdateOp(existingKb, {
        domainKnowledgeEntries: domainEntries,
        traceabilityMap: null,
        boundary: null,
        analysisReport: report
      });
      workspaceRepo.updateProject({ ...project, knowledgeBase: ontologyResult.updatedKb });
      syncProjectWorkspaceKnowledge(workspaceRepo, projectId);
    }

    const kb = project?.knowledgeBase ?? emptyKb();
    const modelingInput = buildModelingInputFromAnalysis({
      projectId,
      iterationId,
      knowledgeBase: kb,
      domainKnowledgeEntries: domainEntries,
      traceabilityMap: null
    });
    continuousModelingWorkspaceService.saveCandidate(modelingInput);
  });

  await registerSystemRoutes(app, {
    serviceName: config.serviceName,
    version: config.version,
    getRuntime: () => runtime.snapshot(),
    getOpsMetrics: () => platformService.getOpsMetrics(),
    isReady: () => runtime.isReady()
  });

  app.register(
    async (v1) => {
      v1.register(async (authScope) => {
        await authScope.register(rateLimit, { max: 10, timeWindow: 60_000 });
        registerAuthRoutes(authScope, workspaceService, config);
      });

      await registerWorkspaceRoutes(v1, workspaceService);
      await registerRepositoryTraceRoutes(v1, workspaceService);
      await registerContinuousModelingRoutes(v1, continuousModelingWorkspaceService);
      await registerPlatformRoutes(v1, platformService, workspaceService);
      await registerOpenclawGlobalRoutes(v1, openclawGlobalService);
    },
    { prefix: "/api/v1" }
  );

  const startBackgroundTasks = () => {
    if (options.syncWorkspaceKnowledgeOnStart !== false) {
      syncAllProjectWorkspaceKnowledge(workspaceRepo);
    }
    if (options.probeLlmOnStart !== false) {
      void refreshLlmRuntimeStatus(runtime, options.env).catch((error) => {
        log.warn("llm probe failed after startup", { error: error instanceof Error ? error.message : String(error) });
      });
    }
    if (options.scheduleWorkspaceRefresh !== false) {
      scheduleDailyProjectWorkspaceRefresh(workspaceRepo);
    }
  };

  return {
    app,
    config,
    runtime,
    workspaceRepo,
    workspaceService,
    platformService,
    refreshLlmRuntimeStatus: () => refreshLlmRuntimeStatus(runtime, options.env),
    startBackgroundTasks
  };
}
