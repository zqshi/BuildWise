"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const fastify_1 = require("fastify");
const cors_1 = require("@fastify/cors");
const modelingService_1 = require("./application/modeling/modelingService");
const platformService_1 = require("./application/platform/platformService");
const agentRunner_1 = require("./application/workspace/agentRunner");
const workspaceService_1 = require("./application/workspace/workspaceService");
const jsonModelRepository_1 = require("./infrastructure/persistence/jsonModelRepository");
const jsonWorkspaceRepository_1 = require("./infrastructure/persistence/jsonWorkspaceRepository");
const sqliteWorkspaceRepository_1 = require("./infrastructure/persistence/sqliteWorkspaceRepository");
const runtimeConfig_1 = require("./infrastructure/runtime/runtimeConfig");
const runtimeAuth_1 = require("./infrastructure/runtime/runtimeAuth");
const runtimeHooks_1 = require("./infrastructure/runtime/runtimeHooks");
const runtimeShutdown_1 = require("./infrastructure/runtime/runtimeShutdown");
const runtimeDependencyProbe_1 = require("./infrastructure/runtime/runtimeDependencyProbe");
const runtimeState_1 = require("./infrastructure/runtime/runtimeState");
const autobootRoutes_1 = require("./interfaces/http/routes/autobootRoutes");
const platformRoutes_1 = require("./interfaces/http/routes/platformRoutes");
const repositoryTraceRoutes_1 = require("./interfaces/http/routes/repositoryTraceRoutes");
const systemRoutes_1 = require("./interfaces/http/routes/systemRoutes");
const workspaceRoutes_1 = require("./interfaces/http/routes/workspaceRoutes");
function stripOuterQuotes(value) {
    const trimmed = value.trim();
    if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}
function loadEnvFileIntoProcessEnv() {
    const processRef = globalThis.process;
    if (!processRef?.env) {
        return;
    }
    const envFile = (0, node_path_1.join)(processRef.cwd(), ".env");
    if (!(0, node_fs_1.existsSync)(envFile)) {
        return;
    }
    const content = (0, node_fs_1.readFileSync)(envFile, "utf-8");
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }
        const idx = line.indexOf("=");
        if (idx <= 0) {
            continue;
        }
        const key = line.slice(0, idx).trim();
        if (!key || processRef.env[key] !== undefined) {
            continue;
        }
        const value = stripOuterQuotes(line.slice(idx + 1));
        processRef.env[key] = value;
    }
}
loadEnvFileIntoProcessEnv();
const env = globalThis.process?.env ?? {};
async function bootstrap() {
    const backendRoot = (0, node_path_1.join)(__dirname, "..");
    const appRoot = (0, node_path_1.join)(backendRoot, "..");
    const config = (0, runtimeConfig_1.loadRuntimeConfig)(env, {
        dataFile: (0, node_path_1.join)(backendRoot, "data.json"),
        modelFile: (0, node_path_1.join)(appRoot, "model.json")
    });
    const runtime = new runtimeState_1.RuntimeState(config);
    const app = (0, fastify_1.default)({
        logger: {
            level: config.nodeEnv === "production" ? "info" : "debug"
        }
    });
    (0, runtimeHooks_1.registerRuntimeHooks)(app, runtime);
    (0, runtimeAuth_1.registerRuntimeAuth)(app, config);
    (0, runtimeShutdown_1.registerGracefulShutdown)(app, runtime, config, globalThis
        .process ?? {
        on: () => { },
        exit: () => { }
    });
    await app.register(cors_1.default, { origin: config.corsOrigins });
    const dataFile = config.dataFile;
    const modelFile = config.modelFile;
    const agentRunner = (0, agentRunner_1.createAgentRunnerFromEnv)(env);
    const llmStatus = await (0, agentRunner_1.probeLlmRuntimeStatus)(env);
    runtime.setLlmStatus(llmStatus);
    const dependencyStatus = await (0, runtimeDependencyProbe_1.probeRuntimeDependencies)(config);
    runtime.setDependencyStatus(dependencyStatus);
    console.log(`[llm-probe] configured=${llmStatus.configured} reachable=${llmStatus.reachable} base=${llmStatus.baseUrl || "n/a"} model=${llmStatus.model} error=${llmStatus.error || "none"}`);
    console.log(`[dependency-probe] modelFile=${dependencyStatus.modelFile.healthy} storage=${dependencyStatus.storage.healthy} required=${config.dependencyRequired}`);
    const workspaceRepo = config.storageBackend === "sqlite"
        ? new sqliteWorkspaceRepository_1.SqliteWorkspaceRepository(config.workspaceDbFile, dataFile)
        : new jsonWorkspaceRepository_1.JsonWorkspaceRepository(dataFile);
    const workspaceService = new workspaceService_1.WorkspaceService(workspaceRepo, agentRunner);
    const modelRepo = new jsonModelRepository_1.JsonModelRepository(modelFile);
    const modelService = new modelingService_1.ModelingService(modelRepo, workspaceRepo);
    const platformService = new platformService_1.PlatformService(workspaceRepo, modelRepo);
    await (0, systemRoutes_1.registerSystemRoutes)(app, {
        serviceName: config.serviceName,
        version: config.version,
        getRuntime: () => runtime.snapshot(),
        isReady: () => runtime.isReady()
    });
    await (0, workspaceRoutes_1.registerWorkspaceRoutes)(app, workspaceService);
    await (0, repositoryTraceRoutes_1.registerRepositoryTraceRoutes)(app, workspaceService);
    await (0, autobootRoutes_1.registerAutobootRoutes)(app, modelService);
    await (0, platformRoutes_1.registerPlatformRoutes)(app, platformService);
    await app.listen({ port: config.port, host: config.host });
    console.log(`BuildWise backend started at http://${config.host}:${config.port}`);
}
bootstrap().catch((err) => {
    console.error(err);
    globalThis.process?.exit?.(1);
});
