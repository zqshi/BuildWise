"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWorkspaceIterationRoutes = registerWorkspaceIterationRoutes;
const workspaceIterationChangeControlRoutes_1 = require("./workspaceIterationChangeControlRoutes");
const workspaceIterationCoreRoutes_1 = require("./workspaceIterationCoreRoutes");
function registerWorkspaceIterationRoutes(app, service) {
    (0, workspaceIterationCoreRoutes_1.registerWorkspaceIterationCoreRoutes)(app, service);
    (0, workspaceIterationChangeControlRoutes_1.registerWorkspaceIterationChangeControlRoutes)(app, service);
}
