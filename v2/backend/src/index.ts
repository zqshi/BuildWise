import { join } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { ModelingService } from "./application/modeling/modelingService";
import { ContinuousModelingService } from "./application/continuousModeling/continuousModelingService";
import { ContinuousModelingWorkspaceService } from "./application/continuousModeling/continuousModelingWorkspaceService";
import { PlatformService } from "./application/platform/platformService";
import { createAgentRunnerFromEnv, probeLlmRuntimeStatus } from "./application/workspace/agentRunner";
import { WorkspaceService } from "./application/workspace/workspaceService";
import { JsonModelRepository } from "./infrastructure/persistence/jsonModelRepository";
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
import { registerAutobootRoutes } from "./interfaces/http/routes/autobootRoutes";
import { registerContinuousModelingRoutes } from "./interfaces/http/routes/continuousModelingRoutes";
import { registerPlatformRoutes } from "./interfaces/http/routes/platformRoutes";
import { registerRepositoryTraceRoutes } from "./interfaces/http/routes/repositoryTraceRoutes";
import { registerSystemRoutes } from "./interfaces/http/routes/systemRoutes";
import { registerWorkspaceRoutes } from "./interfaces/http/routes/workspaceRoutes";

function loadEnvFileIntoProcessEnv() {
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
    console.log(`[env-load] overridden=${result.overridden} file=${result.filePath}`);
  }
}

loadEnvFileIntoProcessEnv();

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

async function bootstrap() {
  const backendRoot = join(__dirname, "..");
  const appRoot = join(backendRoot, "..");
  const config = loadRuntimeConfig(env, {
    dataFile: join(backendRoot, "data.runtime.json"),
    modelFile: join(appRoot, "model.json")
  });
  const runtime = new RuntimeState(config);
  const app = Fastify({
    logger: {
      level: config.nodeEnv === "production" ? "info" : "debug"
    }
  });
  registerRuntimeHooks(app, runtime);
  registerRuntimeAuth(app, config);
  registerGracefulShutdown(app, runtime, config, (globalThis as { process?: { on: (event: string, handler: () => void) => void; exit: (code?: number) => void } }).process ?? {
    on: () => {},
    exit: () => {}
  });
  await app.register(cors, { origin: config.corsOrigins });
  app.get("/", async () => ({
    service: config.serviceName,
    version: config.version,
    status: "ok",
    links: {
      health: "/health",
      ready: "/ready",
      status: "/api/status"
    }
  }));

  const dataFile = config.dataFile;
  const modelFile = config.modelFile;
  const agentRunner = createAgentRunnerFromEnv(env);
  const llmStatus = await probeLlmRuntimeStatus(env);
  runtime.setLlmStatus(llmStatus);
  const dependencyStatus = await probeRuntimeDependencies(config);
  runtime.setDependencyStatus(dependencyStatus);
  console.log(`[llm-probe] configured=${llmStatus.configured} reachable=${llmStatus.reachable} base=${llmStatus.baseUrl || "n/a"} model=${llmStatus.model} error=${llmStatus.error || "none"}`);
  console.log(`[dependency-probe] modelFile=${dependencyStatus.modelFile.healthy} storage=${dependencyStatus.storage.healthy} required=${config.dependencyRequired}`);
  const workspaceRepo =
    config.storageBackend === "sqlite"
      ? new SqliteWorkspaceRepository(config.workspaceDbFile, dataFile)
      : new JsonWorkspaceRepository(dataFile);
  const continuousModelingRepo = new JsonContinuousModelingRepository(join(backendRoot, "continuous-modeling.runtime.json"));
  const workspaceService = new WorkspaceService(workspaceRepo, agentRunner, continuousModelingRepo);
  const modelRepo = new JsonModelRepository(modelFile);
  const modelService = new ModelingService(modelRepo, workspaceRepo, agentRunner);
  const platformService = new PlatformService(workspaceRepo, modelRepo);
  const continuousModelingService = new ContinuousModelingService(continuousModelingRepo);
  const continuousModelingWorkspaceService = new ContinuousModelingWorkspaceService(continuousModelingService, workspaceRepo, continuousModelingRepo);

  // Connect analysis completion → continuous modeling trigger
  workspaceService.analysis.setOnAnalysisCompleted((iterationId, report) => {
    const iteration = workspaceRepo.findIteration(iterationId);
    if (!iteration) return;
    const projectId = iteration.projectId;
    const dk = report.domainKnowledge;
    const ontologyTerms = dk.terms.map((t) => ({
      canonicalTerm: t.term,
      aliases: [] as string[],
      technicalAliases: t.mappedTo.codePaths.slice(0, 3),
      definition: t.definition,
      evidence: [t.evidence]
    }));
    const entityNames = new Set<string>();
    const entities = dk.terms.flatMap((t) => t.mappedTo.entities).filter((name) => {
      if (entityNames.has(name)) return false;
      entityNames.add(name);
      return true;
    }).map((name, idx) => ({
      id: `entity-${projectId}-${idx}`,
      name,
      businessName: name,
      fields: []
    }));
    const rules = dk.rules.map((rule, idx) => ({
      id: `rule-${projectId}-${idx}`,
      name: rule.length > 40 ? `${rule.slice(0, 37)}...` : rule,
      statement: rule,
      linkedEntityIds: [] as string[],
      linkedSurfaceIds: [] as string[],
      linkedApiIds: [] as string[]
    }));
    const businessInputs = [
      report.understanding || "",
      report.businessConfirmation?.coreIntent || ""
    ].filter(Boolean);
    continuousModelingWorkspaceService.saveCandidate({
      projectId,
      iterationId,
      baselineSnapshot: null,
      businessInputs,
      ontologyTerms,
      entities,
      relations: [],
      rules
    });
  });

  await registerSystemRoutes(app, {
    serviceName: config.serviceName,
    version: config.version,
    getRuntime: () => runtime.snapshot(),
    isReady: () => runtime.isReady()
  });
  await registerWorkspaceRoutes(app, workspaceService);
  await registerRepositoryTraceRoutes(app, workspaceService);
  await registerAutobootRoutes(app, modelService);
  await registerContinuousModelingRoutes(app, continuousModelingWorkspaceService);
  await registerPlatformRoutes(app, platformService, workspaceService);

  await app.listen({ port: config.port, host: config.host });
  console.log(`BuildWise backend started at http://${config.host}:${config.port}`);
}

bootstrap().catch((err) => {
  console.error(err);
  (globalThis as { process?: { exit?: (code?: number) => void } }).process?.exit?.(1);
});
