"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSystemRoutes = registerSystemRoutes;
async function registerSystemRoutes(app) {
    app.get("/api/status", async () => {
        return { status: "ok", service: "buildwise-v2-backend" };
    });
    app.get("/health", async () => {
        return { status: "healthy" };
    });
}
