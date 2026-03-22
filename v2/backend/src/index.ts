import { join } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { ContinuousModelingService } from "./application/continuousModeling/continuousModelingService";
import { ContinuousModelingWorkspaceService } from "./application/continuousModeling/continuousModelingWorkspaceService";
import { PlatformService } from "./application/platform/platformService";
import { createAgentRunnerFromEnv, probeLlmRuntimeStatus } from "./application/workspace/agentRunner";
import { WorkspaceService } from "./application/workspace/workspaceService";
import { extractKnowledgeBaseUpdateOp } from "./application/workspace/ontologyService";
import { buildModelingInputFromAnalysis } from "./application/workspace/ontologyModelingBridge";
import { JsonContinuousModelingRepository } from "./infrastructure/persistence/jsonContinuousModelingRepository";
import { JsonWorkspaceRepository } from "./infrastructure/persistence/jsonWorkspaceRepository";
import { SqliteWorkspaceRepository } from "./infrastructure/persistence/sqliteWorkspaceRepository";
import { loadRuntimeConfig } from "./infrastructure/runtime/runtimeConfig";
import { registerRuntimeAuth } from "./infrastructure/runtime/runtimeAuth";
import { registerRuntimeHooks } from "./infrastructure/runtime/runtimeHooks";
import { registerGracefulShutdown } from "./infrastructure/runtime/runtimeShutdown";
import { probeRuntimeDependencies } from "./infrastructure/runtime/runtimeDependencyProbe";
import { RuntimeState } from "./infrastructure/runtime/runtimeState";
import { loadEnvFileIntoMap } from "./infrastructure/runtime/envFileLoader";
import { createLogger } from "./infrastructure/runtime/logger";
import { registerContinuousModelingRoutes } from "./interfaces/http/routes/continuousModelingRoutes";
import { registerPlatformRoutes } from "./interfaces/http/routes/platformRoutes";
import { registerRepositoryTraceRoutes } from "./interfaces/http/routes/repositoryTraceRoutes";
import { registerSystemRoutes } from "./interfaces/http/routes/systemRoutes";
import { registerAuthRoutes } from "./interfaces/http/routes/authRoutes";
import { registerWorkspaceRoutes } from "./interfaces/http/routes/workspaceRoutes";
import { setRevokedTokenStore } from "./infrastructure/runtime/jwt";
import { SqliteRevokedTokenStore } from "./infrastructure/persistence/sqliteRevokedTokenStore";
import { JsonOpenclawGlobalRepository } from "./infrastructure/persistence/jsonOpenclawGlobalRepository";
import { OpenclawGlobalService } from "./application/openclawGlobal/openclawGlobalService";
import { registerOpenclawGlobalRoutes } from "./interfaces/http/routes/openclawGlobalRoutes";

function loadEnvFileIntoProcessEnv() {
  const log = createLogger("env-load");
  const processRef = (globalThis as { process?: { cwd: () => string; env?: Record<string, string | undefined> } }).process;
  if (!processRef?.env) {
    return;
  }
  const preferProcessEnv = (processRef.env.BUILDWISE_PREFER_PROCESS_ENV || "").trim() === "1";
  const llmOverrideKeys = preferProcessEnv
    ? []
    : [
        "LLM_PROVIDER",
        "LLM_API_BASE",
        "LLM_API_KEY",
        "LLM_MODEL",
        "LLM_REQUEST_TIMEOUT_MS",
        "LLM_MAX_OUTPUT_TOKENS",
        "ANTHROPIC_BASE_URL",
        "ANTHROPIC_AUTH_TOKEN",
        "ANTHROPIC_MODEL"
      ];
  const result = loadEnvFileIntoMap({
    cwd: processRef.cwd(),
    env: processRef.env,
    overrideKeys: llmOverrideKeys
  });
  if (result.overridden > 0) {
    log.info("env file overrides applied", { overridden: result.overridden, file: result.filePath });
  }
}

loadEnvFileIntoProcessEnv();

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

async function bootstrap() {
  const log = createLogger("bootstrap");
  const backendRoot = join(__dirname, "..");
  const config = loadRuntimeConfig(env, {
    dataFile: join(backendRoot, "data.runtime.json")
  });
  const runtime = new RuntimeState(config);
  const app = Fastify({
    logger: false
  });
  registerRuntimeHooks(app, runtime, config);
  // Security headers
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
  // CORS must be registered BEFORE auth so that 401 responses also carry CORS headers
  await app.register(cors, { origin: config.corsOrigins, credentials: true });
  // Global rate limit
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs
  });
  registerRuntimeAuth(app, config);
  registerGracefulShutdown(app, runtime, config, (globalThis as { process?: { on: (event: string, handler: () => void) => void; exit: (code?: number) => void } }).process ?? {
    on: () => {},
    exit: () => {}
  });
  app.get("/", async () => ({
    service: config.serviceName,
    status: "ok"
  }));

  const agentRunner = createAgentRunnerFromEnv(env);
  const llmStatus = await probeLlmRuntimeStatus(env);
  runtime.setLlmStatus(llmStatus);
  const dependencyStatus = await probeRuntimeDependencies(config);
  runtime.setDependencyStatus(dependencyStatus);
  log.info("llm probe completed", { configured: llmStatus.configured, reachable: llmStatus.reachable, base: llmStatus.baseUrl || "n/a", model: llmStatus.model, error: llmStatus.error || "none" });
  log.info("dependency probe completed", { storage: dependencyStatus.storage.healthy, required: config.dependencyRequired });
  const workspaceRepo =
    config.storageBackend === "sqlite"
      ? new SqliteWorkspaceRepository(config.workspaceDbFile, config.dataFile)
      : new JsonWorkspaceRepository(config.dataFile);
  // Inject persistent revoked-token store when using SQLite
  if (config.storageBackend === "sqlite" && workspaceRepo instanceof SqliteWorkspaceRepository) {
    setRevokedTokenStore(new SqliteRevokedTokenStore((workspaceRepo as SqliteWorkspaceRepository).getDb()));
  }
  const continuousModelingRepo = new JsonContinuousModelingRepository(join(backendRoot, "continuous-modeling.runtime.json"));
  const workspaceService = new WorkspaceService(workspaceRepo, agentRunner, continuousModelingRepo);
  const platformService = new PlatformService(workspaceRepo);
  const continuousModelingService = new ContinuousModelingService(continuousModelingRepo);
  const continuousModelingWorkspaceService = new ContinuousModelingWorkspaceService(continuousModelingService, workspaceRepo, continuousModelingRepo);

  const openclawGlobalRepo = new JsonOpenclawGlobalRepository(join(backendRoot, "openclaw-global.runtime.json"));
  const openclawGlobalService = new OpenclawGlobalService(openclawGlobalRepo, agentRunner, workspaceRepo);

  // Connect analysis completion → KB update + continuous modeling trigger
  const emptyKb = (): { ontologyTerms: never[]; stableRules: never[]; componentInventory: never[]; codeMap: never[]; decisionLog: never[]; knownRisks: never[]; changePatterns: never[]; updatedAt: string } => ({
    ontologyTerms: [], stableRules: [], componentInventory: [],
    codeMap: [], decisionLog: [], knownRisks: [], changePatterns: [], updatedAt: ""
  });
  workspaceService.analysis.setOnAnalysisCompleted((iterationId, report) => {
    const iteration = workspaceRepo.findIteration(iterationId);
    if (!iteration) return;
    const projectId = iteration.projectId;
    const project = workspaceRepo.findProject(projectId);
    const dk = report.domainKnowledge;

    // 将 LLM 分析结果转为 domainKnowledgeEntries 格式
    const domainEntries = dk.terms.map((t) => ({
      term: t.term,
      definition: t.definition,
      mappedPages: t.mappedTo.pages || [],
      mappedApis: t.mappedTo.apis || [],
      mappedEntities: t.mappedTo.entities || [],
      mappedCodePaths: t.mappedTo.codePaths || [],
      evidence: t.evidence
    }));

    // 即时 KB 更新 — 通过 OntologyService 填充全部 7 字段
    if (project) {
      const existingKb = project.knowledgeBase ?? emptyKb();
      const ontologyResult = extractKnowledgeBaseUpdateOp(existingKb, {
        domainKnowledgeEntries: domainEntries,
        traceabilityMap: null,
        boundary: null,
        analysisReport: report
      });
      workspaceRepo.updateProject({ ...project, knowledgeBase: ontologyResult.updatedKb });
    }

    // ContinuousModeling — 通过 bridge 生成候选快照
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

  // Infrastructure routes stay at root level (no version prefix)
  await registerSystemRoutes(app, {
    serviceName: config.serviceName,
    version: config.version,
    getRuntime: () => runtime.snapshot(),
    isReady: () => runtime.isReady()
  });

  // All business routes under /api/v1
  app.register(async (v1) => {
    // Auth routes get stricter rate limiting (10 req/min for SMS endpoints)
    v1.register(async (authScope) => {
      await authScope.register(rateLimit, { max: 10, timeWindow: 60_000 });
      registerAuthRoutes(authScope, workspaceService, config);
    });

    await registerWorkspaceRoutes(v1, workspaceService);
    await registerRepositoryTraceRoutes(v1, workspaceService);
    await registerContinuousModelingRoutes(v1, continuousModelingWorkspaceService);
    await registerPlatformRoutes(v1, platformService, workspaceService);
    await registerOpenclawGlobalRoutes(v1, openclawGlobalService);
  }, { prefix: "/api/v1" });

  await app.listen({ port: config.port, host: config.host });
  log.info("server started", { host: config.host, port: config.port });
}

process.on("unhandledRejection", (reason) => {
  const log = createLogger("process");
  log.error("unhandled rejection", { error: reason instanceof Error ? reason.message : String(reason) });
});

process.on("uncaughtException", (err) => {
  const log = createLogger("process");
  log.error("uncaught exception — shutting down", { error: err.message, stack: err.stack });
  process.exit(1);
});

bootstrap().catch((err) => {
  const log = createLogger("bootstrap");
  log.error("bootstrap failed", { error: err instanceof Error ? err.message : String(err) });
  (globalThis as { process?: { exit?: (code?: number) => void } }).process?.exit?.(1);
});
