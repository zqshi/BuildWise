"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.opsTriageTemplates = exports.projectTemplates = exports.deploymentTransitions = exports.rolePermissions = void 0;
exports.hasPermission = hasPermission;
exports.nowIso = nowIso;
exports.randomToken = randomToken;
exports.resolveIterationId = resolveIterationId;
exports.normalizeTemplateParameters = normalizeTemplateParameters;
exports.resolveDeploymentIterationId = resolveDeploymentIterationId;
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
exports.projectTemplates = [
    {
        id: "tpl-req-review",
        name: "需求评审模板",
        category: "requirements",
        description: "生成需求评审清单与风险确认项"
    },
    {
        id: "tpl-api-mvp",
        name: "接口联调模板",
        category: "delivery",
        description: "生成联调步骤、验收项与回滚点"
    },
    {
        id: "tpl-release-check",
        name: "发版巡检模板",
        category: "ops",
        description: "生成发布前/后巡检动作与阈值"
    }
];
exports.opsTriageTemplates = [
    {
        id: "triage-health-readiness",
        category: "health",
        keywords: ["健康", "health", "ready", "就绪"],
        commands: [
            "curl -sS {{apiBase}}/health",
            "curl -sS {{apiBase}}/ready",
            "curl -sS {{apiBase}}/api/ops/runtime"
        ],
        note: "用于确认服务健康与依赖可达性。"
    },
    {
        id: "triage-metrics-runtime",
        category: "metrics",
        keywords: ["指标", "metric", "延迟", "错误率", "runtime"],
        commands: [
            "curl -sS {{apiBase}}/api/ops/metrics",
            "curl -sS {{apiBase}}/api/ops/runtime"
        ],
        note: "用于定位延迟、错误率与限流异常。"
    },
    {
        id: "triage-deployment-check",
        category: "deployment",
        keywords: ["发布", "deploy", "上线", "deployment"],
        commands: [
            "curl -sS {{apiBase}}/api/ops/deployments",
            "cd {{backendDir}} && npm run ops:preflight"
        ],
        note: "用于发布前后核查门禁与记录。"
    },
    {
        id: "triage-rollback",
        category: "rollback",
        keywords: ["回滚", "rollback", "故障恢复"],
        commands: [
            "cd {{backendDir}} && PROJECT_ID={{projectId}} npm run ops:rollback",
            "curl -sS {{apiBase}}/api/ops/deployments"
        ],
        note: "用于触发回滚并回看部署状态。"
    }
];
function resolveIterationId(workspaceRepo, projectId) {
    const iterations = workspaceRepo.listIterations(projectId);
    if (iterations.length === 0) {
        return null;
    }
    const current = iterations.find((item) => item.current);
    return (current ?? iterations[iterations.length - 1]).id;
}
function normalizeTemplateParameters(workspaceRepo, projectId, parameters) {
    const normalized = { ...parameters };
    const rawIterationId = parameters.iterationId?.trim();
    const parsedIterationId = Number(rawIterationId);
    const validProvidedIteration = Number.isInteger(parsedIterationId) &&
        parsedIterationId > 0 &&
        workspaceRepo.findIteration(parsedIterationId)?.projectId === projectId;
    if (validProvidedIteration) {
        normalized.iterationId = String(parsedIterationId);
        return normalized;
    }
    const fallbackIterationId = resolveIterationId(workspaceRepo, projectId);
    if (fallbackIterationId) {
        normalized.iterationId = String(fallbackIterationId);
    }
    return normalized;
}
function resolveDeploymentIterationId(workspaceRepo, projectId, iterationId) {
    if (typeof iterationId === "number" && Number.isInteger(iterationId) && iterationId > 0) {
        const matched = workspaceRepo.findIteration(iterationId);
        if (matched && matched.projectId === projectId) {
            return iterationId;
        }
    }
    return resolveIterationId(workspaceRepo, projectId);
}
