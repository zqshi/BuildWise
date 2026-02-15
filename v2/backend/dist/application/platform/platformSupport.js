"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deploymentTransitions = exports.rolePermissions = void 0;
exports.hasPermission = hasPermission;
exports.nowIso = nowIso;
exports.randomToken = randomToken;
exports.rolePermissions = {
    owner: ["*"],
    pm: ["collab:write", "collab:read", "template:run", "deploy:read"],
    developer: ["collab:read", "template:run", "deploy:write", "deploy:read"],
    qa: ["collab:read", "deploy:read", "deploy:transition"],
    viewer: ["collab:read", "deploy:read"]
};
function hasPermission(role, permission) {
    const permissions = exports.rolePermissions[role] || [];
    return permissions.includes("*") || permissions.includes(permission);
}
exports.deploymentTransitions = {
    queued: ["running", "failed"],
    running: ["success", "failed"],
    success: [],
    failed: ["running"]
};
function nowIso() {
    return new Date().toISOString();
}
function randomToken(prefix = "") {
    return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}
