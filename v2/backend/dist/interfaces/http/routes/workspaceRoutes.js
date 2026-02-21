"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWorkspaceRoutes = registerWorkspaceRoutes;
const workspaceIterationRoutes_1 = require("./workspaceIterationRoutes");
const workspaceProjectRoutes_1 = require("./workspaceProjectRoutes");
async function registerWorkspaceRoutes(app, service) {
    (0, workspaceProjectRoutes_1.registerWorkspaceProjectRoutes)(app, service);
    (0, workspaceIterationRoutes_1.registerWorkspaceIterationRoutes)(app, service);
}
