import { join } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import { ModelingService } from "./application/modeling/modelingService";
import { PlatformService } from "./application/platform/platformService";
import { WorkspaceService } from "./application/workspace/workspaceService";
import { JsonModelRepository } from "./infrastructure/persistence/jsonModelRepository";
import { JsonWorkspaceRepository } from "./infrastructure/persistence/jsonWorkspaceRepository";
import { registerAutobootRoutes } from "./interfaces/http/routes/autobootRoutes";
import { registerPlatformRoutes } from "./interfaces/http/routes/platformRoutes";
import { registerSystemRoutes } from "./interfaces/http/routes/systemRoutes";
import { registerWorkspaceRoutes } from "./interfaces/http/routes/workspaceRoutes";

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

async function bootstrap() {
  const app = Fastify({
    logger: true
  });

  await app.register(cors, { origin: true });

  const backendRoot = join(__dirname, "..");
  const appRoot = join(backendRoot, "..");
  const dataFile = env.WORKSPACE_DATA_FILE || join(backendRoot, "data.json");
  const modelFile = env.MODEL_FILE || join(appRoot, "model.json");

  const workspaceRepo = new JsonWorkspaceRepository(dataFile);
  const workspaceService = new WorkspaceService(workspaceRepo);
  const modelRepo = new JsonModelRepository(modelFile);
  const modelService = new ModelingService(modelRepo, workspaceRepo);
  const platformService = new PlatformService(workspaceRepo, modelRepo);

  await registerSystemRoutes(app);
  await registerWorkspaceRoutes(app, workspaceService);
  await registerAutobootRoutes(app, modelService);
  await registerPlatformRoutes(app, platformService);

  const PORT = Number(env.PORT || 5055);
  const HOST = env.HOST || "127.0.0.1";
  await app.listen({ port: PORT, host: HOST });
}

bootstrap().catch((err) => {
  console.error(err);
  (globalThis as { process?: { exit?: (code?: number) => void } }).process?.exit?.(1);
});
