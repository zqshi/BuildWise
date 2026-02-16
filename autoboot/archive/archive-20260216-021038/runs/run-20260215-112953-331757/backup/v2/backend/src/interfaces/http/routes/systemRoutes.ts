import type { FastifyInstance } from "fastify";

export async function registerSystemRoutes(app: FastifyInstance) {
  app.get("/api/status", async () => {
    return { status: "ok", service: "buildwise-v2-backend" };
  });

  app.get("/health", async () => {
    return { status: "healthy" };
  });
}
