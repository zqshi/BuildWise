"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_path_1 = require("node:path");
const fastify_1 = require("fastify");
const cors_1 = require("@fastify/cors");
const modelingService_1 = require("./application/modeling/modelingService");
const workspaceService_1 = require("./application/workspace/workspaceService");
const jsonModelRepository_1 = require("./infrastructure/persistence/jsonModelRepository");
const jsonWorkspaceRepository_1 = require("./infrastructure/persistence/jsonWorkspaceRepository");
const autobootRoutes_1 = require("./interfaces/http/routes/autobootRoutes");
const systemRoutes_1 = require("./interfaces/http/routes/systemRoutes");
const workspaceRoutes_1 = require("./interfaces/http/routes/workspaceRoutes");
const env = globalThis.process?.env ?? {};
async function bootstrap() {
    const app = (0, fastify_1.default)({
        logger: true
    });
    await app.register(cors_1.default, { origin: true });
    const backendRoot = (0, node_path_1.join)(__dirname, "..");
    const appRoot = (0, node_path_1.join)(backendRoot, "..");
    const dataFile = env.WORKSPACE_DATA_FILE || (0, node_path_1.join)(backendRoot, "data.json");
    const modelFile = env.MODEL_FILE || (0, node_path_1.join)(appRoot, "model.json");
    const workspaceRepo = new jsonWorkspaceRepository_1.JsonWorkspaceRepository(dataFile);
    const workspaceService = new workspaceService_1.WorkspaceService(workspaceRepo);
    const modelRepo = new jsonModelRepository_1.JsonModelRepository(modelFile);
    const modelService = new modelingService_1.ModelingService(modelRepo, workspaceRepo);
    await (0, systemRoutes_1.registerSystemRoutes)(app);
    await (0, workspaceRoutes_1.registerWorkspaceRoutes)(app, workspaceService);
    await (0, autobootRoutes_1.registerAutobootRoutes)(app, modelService);
    const PORT = Number(env.PORT || 5055);
    const HOST = env.HOST || "127.0.0.1";
    await app.listen({ port: PORT, host: HOST });
}
bootstrap().catch((err) => {
    console.error(err);
    globalThis.process?.exit?.(1);
});
