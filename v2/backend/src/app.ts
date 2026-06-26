import { join } from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ContinuousModelingService } from "./application/continuousModeling/continuousModelingService";
import { ContinuousModelingWorkspaceService } from "./application/continuousModeling/continuousModelingWorkspaceService";
import { PlatformService } from "./application/platform/platformService";
import { createAgentRunnerFromEnv, probeLlmRuntimeStatus } from './application/workspace/shared/agentRunner';
import { extractKnowledgeBaseUpdateOp } from './application/workspace/project/ontologyService';
import { buildModelingInputFromAnalysis, buildTraceabilityMapFromDomainEntries } from './application/workspace/project/ontologyModelingBridge';
import { syncAllProjectWorkspaceKnowledge, syncProjectWorkspaceKnowledge } from './application/workspace/project/projectWorkspaceKnowledgeService';
import { WorkspaceService } from './application/workspace/shared/workspaceService';
import { AgentRegistry } from "./infrastructure/agent/agentRegistry";
import { ClaudeCodeCliAdapter } from "./infrastructure/agent/adapters/claudeCodeCliAdapter";
import type { CodeRewriteJobStore } from "./application/workspace/quality/codeRewriteJobOps";
import type { FullCycleJobStore } from "./application/workspace/quality/fullCycleJobOps";
import type { WorkspaceRepository } from "./domain/workspace/repository";
import { JsonContinuousModelingRepository } from "./infrastructure/persistence/jsonContinuousModelingRepository";
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

/**
 * V4 经验沉淀定时扫描：定时跑 runExperienceScan 扫所有项目，补漏未触发的经验提取。
 * 受 BUILDWISE_EXPERIENCE_SCAN_ENABLED 控制（默认关，因消耗 LLM 额度）；runExperienceScan 内部再检查 scheduleScanEnabled policy。
 */
function schedulePeriodicExperienceScan(workspaceRepo: WorkspaceRepository, workspaceService: WorkspaceService, env: Record<string, string | undefined>) {
  const scanLog = createLogger("experience-scan-scheduler");
  const enabled = (env.BUILDWISE_EXPERIENCE_SCAN_ENABLED || "0").trim() === "1";
  if (!enabled) return;
  const intervalHours = Math.max(1, Number.parseInt(env.BUILDWISE_EXPERIENCE_SCAN_INTERVAL_HOURS || "6", 10) || 6);
  const scheduleNext = () => {
    const delayMs = intervalHours * 60 * 60 * 1000;
    setTimeout(async () => {
      try {
        for (const project of workspaceRepo.listProjects()) {
          const result = await workspaceService.experience.runFullScan(project.id);
          if (result.newEntries > 0) {
            scanLog.info("experience scan extracted new entries", { projectId: project.id, newEntries: result.newEntries });
          }
        }
      } catch (error) {
        scanLog.error("periodic experience scan failed", { error: error instanceof Error ? error.message : String(error) });
      } finally {
        scheduleNext();
      }
    }, delayMs).unref();
  };
  scheduleNext();
}

async function registerMiddleware(
  app: ReturnType<typeof Fastify>,
  runtime: RuntimeState,
  config: ReturnType<typeof loadRuntimeConfig>,
  options: CreateBuildwiseAppOptions
) {
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
  if (config.rateLimitMax > 0) {
    await app.register(rateLimit, { max: config.rateLimitMax, timeWindow: config.rateLimitWindowMs });
  }
  registerRuntimeAuth(app, config);
  if (options.registerProcessHandlers !== false) {
    registerGracefulShutdown(app, runtime, config, resolveProcessHooks());
  }
  app.get("/", async () => ({ service: config.serviceName, status: "ok" }));
}

function wireAnalysisEventHandlers(
  workspaceService: WorkspaceService,
  workspaceRepo: WorkspaceRepository,
  continuousModelingWorkspaceService: ContinuousModelingWorkspaceService
) {
  const emptyKb = (): { ontologyTerms: never[]; stableRules: never[]; componentInventory: never[]; codeMap: never[]; decisionLog: never[]; knownRisks: never[]; changePatterns: never[]; updatedAt: string } => ({
    ontologyTerms: [], stableRules: [], componentInventory: [], codeMap: [], decisionLog: [], knownRisks: [], changePatterns: [], updatedAt: ""
  });

  workspaceService.analysis.setOnAnalysisCompleted((iterationId, report) => {
    const iteration = workspaceRepo.findIteration(iterationId);
    if (!iteration) return;
    const projectId = iteration.projectId;
    const project = workspaceRepo.findProject(projectId);
    const dk = report.domainKnowledge;
    const domainEntries = dk.terms.map((t) => ({
      term: t.term, definition: t.definition,
      mappedPages: t.mappedTo.pages || [], mappedApis: t.mappedTo.apis || [],
      mappedEntities: t.mappedTo.entities || [], mappedCodePaths: t.mappedTo.codePaths || [],
      evidence: t.evidence
    }));
    const bridgeTraceMap = buildTraceabilityMapFromDomainEntries(domainEntries);
    if (project) {
      const existingKb = project.knowledgeBase ?? emptyKb();
      const ontologyResult = extractKnowledgeBaseUpdateOp(existingKb, {
        domainKnowledgeEntries: domainEntries, traceabilityMap: bridgeTraceMap, boundary: null, analysisReport: report
      });
      workspaceRepo.updateProject({ ...project, knowledgeBase: ontologyResult.updatedKb });
      syncProjectWorkspaceKnowledge(workspaceRepo, projectId);
    }
    const kb = workspaceRepo.findProject(projectId)?.knowledgeBase ?? emptyKb();
    const modelingInput = buildModelingInputFromAnalysis({
      projectId, iterationId, knowledgeBase: kb,
      domainKnowledgeEntries: domainEntries, traceabilityMap: bridgeTraceMap,
      reportTraceabilityMap: report.traceabilityMap
    });
    continuousModelingWorkspaceService.saveCandidate(modelingInput);
  });

  workspaceService.changeControl.setOnAnalysisConfirmed((iterationId, projectId) => {
    const project = workspaceRepo.findProject(projectId);
    if (!project) return;
    const kb = project.knowledgeBase ?? emptyKb();
    const iteration = workspaceRepo.findIteration(iterationId);
    if (!iteration) return;
    const domainEntries = iteration.changeControl?.domainKnowledgeEntries ?? [];
    const bridgeTraceMap = buildTraceabilityMapFromDomainEntries(domainEntries);
    const modelingInput = buildModelingInputFromAnalysis({
      projectId, iterationId, knowledgeBase: kb,
      domainKnowledgeEntries: domainEntries, traceabilityMap: bridgeTraceMap,
    });
    const saveResult = continuousModelingWorkspaceService.saveCandidate(modelingInput);
    if (saveResult.ok && saveResult.data?.snapshotId) {
      continuousModelingWorkspaceService.publishSnapshot(saveResult.data.snapshotId, projectId);
    }
  });
}

async function registerApiRoutes(
  app: ReturnType<typeof Fastify>,
  workspaceService: WorkspaceService,
  platformService: PlatformService,
  continuousModelingWorkspaceService: ContinuousModelingWorkspaceService,
  config: ReturnType<typeof loadRuntimeConfig>,
  runtime: RuntimeState
) {
  await registerSystemRoutes(app, {
    serviceName: config.serviceName,
    version: config.version,
    getRuntime: () => runtime.snapshot(),
    getOpsMetrics: () => platformService.getOpsMetrics(),
    isReady: () => runtime.isReady()
  });
  app.register(
    async (v1: FastifyInstance) => {
      v1.register(async (authScope: FastifyInstance) => {
        await authScope.register(rateLimit, { max: 30, timeWindow: 60_000 });
        registerAuthRoutes(authScope, workspaceService, config);
      });
      await registerWorkspaceRoutes(v1, workspaceService);
      await registerRepositoryTraceRoutes(v1, workspaceService);
      await registerContinuousModelingRoutes(v1, continuousModelingWorkspaceService);
      await registerPlatformRoutes(v1, platformService, workspaceService);
    },
    { prefix: "/api/v1" }
  );
}

export async function createBuildwiseApp(options: CreateBuildwiseAppOptions): Promise<BuildwiseAppContext> {
  const log = createLogger("bootstrap");
  const backendRoot = join(__dirname, "..");
  const config = loadRuntimeConfig(options.env, {
    dataFile: options.dataFile || join(backendRoot, "data.runtime.json")
  });
  const runtime = new RuntimeState(config);
  const app = Fastify({ logger: false, requestTimeout: 600_000 });
  await registerMiddleware(app, runtime, config, options);

  const agentRunner = createAgentRunnerFromEnv(options.env);
  const dependencyStatus = await probeRuntimeDependencies(config);
  runtime.setDependencyStatus(dependencyStatus);
  log.info("dependency probe completed", { storage: dependencyStatus.storage.healthy, required: config.dependencyRequired });

  const workspaceRepo = new SqliteWorkspaceRepository(config.workspaceDbFile, config.dataFile, {
    bootstrapMode: config.allowSeedDataBootstrap ? "seed" : "empty"
  });
  setRevokedTokenStore(new SqliteRevokedTokenStore(workspaceRepo.getDb()));
  const continuousModelingDataFile = (options.env?.CONTINUOUS_MODELING_DATA_FILE || "").trim() || join(backendRoot, "continuous-modeling.runtime.json");
  const continuousModelingRepo = new JsonContinuousModelingRepository(continuousModelingDataFile);
  // 编码 agent 注册表 + codeRewrite job store（V2.2）：当启用时走编码 agent 真实改代码路径
  const codingAgentEnabled = (options.env?.BUILDWISE_CODING_AGENT_ENABLED || "1").trim() !== "0";
  let codingAgentRegistry: AgentRegistry | null = null;
  if (codingAgentEnabled) {
    codingAgentRegistry = new AgentRegistry();
    const claudeAdapter = new ClaudeCodeCliAdapter();
    if (claudeAdapter.implemented) {
      codingAgentRegistry.register("claude-code-cli", () => new ClaudeCodeCliAdapter());
      log.info("coding agent registered", { type: claudeAdapter.agentType });
    }
  }
  const codeRewriteJobStore: CodeRewriteJobStore = { jobs: new Map() };
  const fullCycleJobStore: FullCycleJobStore = { jobs: new Map() };
  const workspaceService = new WorkspaceService(workspaceRepo, agentRunner, continuousModelingRepo, codingAgentRegistry, codeRewriteJobStore, fullCycleJobStore);

  const bootstrapAdminPhone = (options.env?.BOOTSTRAP_ADMIN_PHONE || "").trim();
  if (bootstrapAdminPhone && /^1\d{10}$/.test(bootstrapAdminPhone)) {
    const existingBindings = workspaceRepo.listPlatformRoleBindings();
    if (existingBindings.length === 0) {
      const now = new Date().toISOString();
      workspaceRepo.upsertPlatformRoleBinding({ id: 1, userId: bootstrapAdminPhone, role: "admin", createdAt: now, updatedAt: now });
      log.info("bootstrap admin created", { phone: `${bootstrapAdminPhone.slice(0, 3)}****${bootstrapAdminPhone.slice(7)}` });
    }
  }

  const platformService = new PlatformService(workspaceRepo);
  const continuousModelingService = new ContinuousModelingService(continuousModelingRepo);
  const continuousModelingWorkspaceService = new ContinuousModelingWorkspaceService(continuousModelingService, workspaceRepo, continuousModelingRepo);

  wireAnalysisEventHandlers(workspaceService, workspaceRepo, continuousModelingWorkspaceService);
  await registerApiRoutes(app, workspaceService, platformService, continuousModelingWorkspaceService, config, runtime);

  const startBackgroundTasks = () => {
    if (options.syncWorkspaceKnowledgeOnStart !== false) {
      syncAllProjectWorkspaceKnowledge(workspaceRepo);
    }
    if (options.probeLlmOnStart !== false) {
      const tryProbe = async (attempt: number) => {
        try {
          await refreshLlmRuntimeStatus(runtime, options.env);
          if (!runtime.snapshot().llm.reachable && attempt < 10) {
            log.info(`llm probe unreachable, will retry in 30s (attempt ${attempt + 1}/10)`);
            setTimeout(() => void tryProbe(attempt + 1), 30_000);
          }
        } catch (error) {
          log.warn("llm probe failed", { error: error instanceof Error ? error.message : String(error) });
          if (attempt < 10) {
            setTimeout(() => void tryProbe(attempt + 1), 30_000);
          }
        }
      };
      void tryProbe(0);
    }
    if (options.scheduleWorkspaceRefresh !== false) {
      scheduleDailyProjectWorkspaceRefresh(workspaceRepo);
      schedulePeriodicExperienceScan(workspaceRepo, workspaceService, options.env ?? {});
    }
  };

  return {
    app, config, runtime, workspaceRepo, workspaceService, platformService,
    refreshLlmRuntimeStatus: () => refreshLlmRuntimeStatus(runtime, options.env),
    startBackgroundTasks
  };
}
