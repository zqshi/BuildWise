"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statusTransitions = void 0;
exports.fallbackScope = fallbackScope;
exports.fallbackContinuity = fallbackContinuity;
exports.fallbackAssessment = fallbackAssessment;
exports.normalizeIteration = normalizeIteration;
exports.recomputeAssessment = recomputeAssessment;
exports.summarizeFromExcerpt = summarizeFromExcerpt;
exports.inferRisksFromExcerpt = inferRisksFromExcerpt;
exports.buildMergedIterationPayload = buildMergedIterationPayload;
exports.buildDiffLocations = buildDiffLocations;
exports.inferCyclePhase = inferCyclePhase;
exports.buildIterationAgentPlan = buildIterationAgentPlan;
exports.statusTransitions = {
    planned: ["in-progress", "blocked"],
    "in-progress": ["review", "blocked", "completed"],
    review: ["in-progress", "completed", "blocked"],
    blocked: ["in-progress", "review"],
    completed: ["in-progress"]
};
function fallbackScope(goals) {
    return {
        inScope: goals,
        outOfScope: [],
        acceptanceCriteria: goals.map((goal) => `${goal} 可演示并通过验收`)
    };
}
function fallbackContinuity() {
    return {
        inheritedFromIterationId: null,
        inheritedSummary: "首个迭代，无需继承。",
        carriedGoals: [],
        carriedRisks: [],
        carriedDecisions: []
    };
}
function fallbackAssessment(scope, summary) {
    return {
        baselineIterationId: null,
        baselineIterationName: "无基线",
        currentSummary: summary,
        deltaInScope: scope.inScope,
        resolvedItems: [],
        pendingItems: scope.inScope,
        risks: []
    };
}
function normalizeIteration(iteration) {
    const goals = Array.isArray(iteration.goals) ? iteration.goals : [];
    const scope = iteration.scope ?? fallbackScope(goals);
    const continuity = iteration.continuity ?? fallbackContinuity();
    const summary = iteration.aiSummary || `${iteration.name} 进入执行阶段`;
    const assessment = iteration.assessment ?? fallbackAssessment(scope, summary);
    return {
        ...iteration,
        goals,
        modules: Array.isArray(iteration.modules) ? iteration.modules : [],
        status: iteration.status || "in-progress",
        scope: {
            inScope: Array.isArray(scope.inScope) ? scope.inScope : [],
            outOfScope: Array.isArray(scope.outOfScope) ? scope.outOfScope : [],
            acceptanceCriteria: Array.isArray(scope.acceptanceCriteria) ? scope.acceptanceCriteria : []
        },
        continuity: {
            inheritedFromIterationId: continuity.inheritedFromIterationId ?? null,
            inheritedSummary: continuity.inheritedSummary || "",
            carriedGoals: Array.isArray(continuity.carriedGoals) ? continuity.carriedGoals : [],
            carriedRisks: Array.isArray(continuity.carriedRisks) ? continuity.carriedRisks : [],
            carriedDecisions: Array.isArray(continuity.carriedDecisions) ? continuity.carriedDecisions : []
        },
        assessment: {
            baselineIterationId: assessment.baselineIterationId ?? null,
            baselineIterationName: assessment.baselineIterationName || "无基线",
            currentSummary: assessment.currentSummary || "",
            deltaInScope: Array.isArray(assessment.deltaInScope) ? assessment.deltaInScope : [],
            resolvedItems: Array.isArray(assessment.resolvedItems) ? assessment.resolvedItems : [],
            pendingItems: Array.isArray(assessment.pendingItems) ? assessment.pendingItems : [],
            risks: Array.isArray(assessment.risks) ? assessment.risks : []
        }
    };
}
function recomputeAssessment(current, previous) {
    const prevScope = previous?.scope.inScope ?? [];
    const currScope = current.scope.inScope;
    const deltaInScope = [
        ...currScope.filter((item) => !prevScope.includes(item)).map((item) => `+ ${item}`),
        ...prevScope.filter((item) => !currScope.includes(item)).map((item) => `- ${item}`)
    ];
    return {
        baselineIterationId: previous?.id ?? null,
        baselineIterationName: previous?.name ?? "无基线",
        currentSummary: current.assessment.currentSummary || current.aiSummary || "当前迭代已定义范围，待执行交付。",
        deltaInScope,
        resolvedItems: previous ? prevScope.filter((item) => !currScope.includes(item)) : [],
        pendingItems: currScope,
        risks: current.continuity.carriedRisks
    };
}
function summarizeFromExcerpt(excerpt, fallback) {
    const clean = excerpt.replace(/\s+/g, " ").trim();
    if (!clean) {
        return fallback;
    }
    return `已解析附件片段，关键内容：${clean.slice(0, 120)}${clean.length > 120 ? "..." : ""}`;
}
function inferRisksFromExcerpt(excerpt) {
    const lowered = excerpt.toLowerCase();
    const risks = [];
    if (lowered.includes("延期") || lowered.includes("delay")) {
        risks.push("附件提及进度风险，建议补充里程碑缓冲。");
    }
    if (lowered.includes("待确认") || lowered.includes("todo")) {
        risks.push("附件存在待确认项，建议在版本评审前补齐决策。");
    }
    return risks;
}
function mergeList(primary, fallback) {
    if (Array.isArray(primary) && primary.length > 0) {
        return primary;
    }
    return fallback;
}
function buildMergedIterationPayload(payload, project, previous) {
    const goals = mergeList(payload.goals, previous?.goals?.length ? previous.goals : [payload.name]);
    const scope = {
        inScope: mergeList(payload.scope?.inScope, previous?.scope?.inScope ?? goals),
        outOfScope: mergeList(payload.scope?.outOfScope, previous?.scope?.outOfScope ?? []),
        acceptanceCriteria: mergeList(payload.scope?.acceptanceCriteria, previous?.scope?.acceptanceCriteria ?? goals.map((goal) => `${goal} 可演示并通过验收`))
    };
    const continuity = {
        inheritedFromIterationId: previous?.id ?? null,
        inheritedSummary: previous
            ? `继承自 ${previous.name}，并导入项目元信息：${project?.name ?? "未知项目"}`
            : "首个迭代，无需继承。",
        carriedGoals: previous?.assessment.pendingItems?.length ? previous.assessment.pendingItems : previous?.goals ?? [],
        carriedRisks: previous?.assessment.risks ?? [],
        carriedDecisions: previous
            ? [
                ...(previous.continuity.carriedDecisions ?? []),
                `项目元信息：${project?.name ?? "未知项目"}｜${project?.description ?? "暂无描述"}`
            ]
            : [`项目元信息：${project?.name ?? "未知项目"}｜${project?.description ?? "暂无描述"}`]
    };
    const assessment = {
        baselineIterationId: previous?.id ?? null,
        baselineIterationName: previous?.name ?? "无基线",
        currentSummary: payload.aiSummary?.trim() ||
            `基于项目「${project?.name ?? "未命名项目"}」元信息，${payload.name} 继承上版本上下文并进入执行。`,
        deltaInScope: [
            ...scope.inScope.filter((item) => !(previous?.scope.inScope ?? []).includes(item)).map((item) => `+ ${item}`),
            ...(previous?.scope.inScope ?? []).filter((item) => !scope.inScope.includes(item)).map((item) => `- ${item}`)
        ],
        resolvedItems: previous?.scope.inScope.filter((item) => !scope.inScope.includes(item)) ?? [],
        pendingItems: scope.inScope,
        risks: previous?.assessment.risks ?? []
    };
    return {
        ...payload,
        goals,
        scope,
        continuity,
        assessment,
        aiSummary: assessment.currentSummary
    };
}
function buildDiffLocations(previous, current) {
    const diffLocations = [];
    const pushDimensionDiff = (dimension, baseline, target) => {
        for (const item of target.filter((value) => !baseline.includes(value))) {
            diffLocations.push({ dimension, changeType: "added", currentItem: item });
        }
        for (const item of baseline.filter((value) => !target.includes(value))) {
            diffLocations.push({ dimension, changeType: "removed", currentItem: item, baselineItem: item });
        }
    };
    pushDimensionDiff("goals", previous?.goals ?? [], current.goals ?? []);
    pushDimensionDiff("inScope", previous?.scope.inScope ?? [], current.scope.inScope ?? []);
    pushDimensionDiff("outOfScope", previous?.scope.outOfScope ?? [], current.scope.outOfScope ?? []);
    pushDimensionDiff("acceptanceCriteria", previous?.scope.acceptanceCriteria ?? [], current.scope.acceptanceCriteria ?? []);
    return diffLocations;
}
function inferCyclePhase(status) {
    switch (status) {
        case "planned":
            return "scope-clarified";
        case "in-progress":
            return "build-in-progress";
        case "review":
            return "qa-review";
        case "completed":
            return "ready-for-release";
        case "blocked":
            return "task-planning";
        default:
            return "task-planning";
    }
}
function suggestNextTransition(status, risks, diffCount) {
    const hasRisk = risks.length > 0 && !risks.every((item) => item.includes("暂无显式风险"));
    if (status === "planned") {
        return "in-progress";
    }
    if (status === "in-progress") {
        if (hasRisk) {
            return "blocked";
        }
        return diffCount > 0 ? "review" : "in-progress";
    }
    if (status === "review") {
        return hasRisk ? "in-progress" : "completed";
    }
    if (status === "blocked") {
        return hasRisk ? "blocked" : "in-progress";
    }
    return null;
}
function buildPrompt(input) {
    return {
        agentId: input.agentId,
        role: input.role,
        scope: input.scope,
        goal: input.goal,
        systemPrompt: `你是 BuildWise 的${input.role}，scope=${input.scope}。输出必须结构化且可执行。`,
        userPrompt: `目标：${input.goal}\n上下文：${input.context}\n请严格输出：${input.expectedOutput}`,
        expectedOutput: input.expectedOutput
    };
}
function buildIterationAgentPlan(params) {
    const { iteration, previous, scope, diffLocations, risks, fileName, forceMultiAgent } = params;
    const multiAgent = Boolean(forceMultiAgent) || diffLocations.length >= 2 || scope === "full-cycle";
    const recommendedTransition = suggestNextTransition(iteration.status, risks, diffLocations.length);
    const objective = `基于附件 ${fileName} 驱动迭代 ${iteration.name} 全周期闭环执行`;
    const diffDigest = diffLocations.length > 0
        ? diffLocations
            .slice(0, 6)
            .map((item) => `${item.dimension}:${item.changeType}:${item.currentItem}`)
            .join("；")
        : "无结构化差异";
    const contextBase = `项目迭代=${iteration.name}；当前状态=${iteration.status}；基线=${previous?.name ?? "无"}；差异=${diffDigest}；风险=${risks.join("；")}`;
    const executionLoop = [
        "解析附件并固化范围差异",
        "按差异重排任务清单与责任人",
        "执行开发与自测，记录阻塞",
        "触发评审与验收，决定是否流转状态"
    ];
    if (!multiAgent) {
        return {
            strategy: "single-agent",
            scope,
            objective,
            recommendedTransition,
            executionLoop,
            prompts: [
                buildPrompt({
                    agentId: "agent-orchestrator-1",
                    role: "orchestrator",
                    scope,
                    goal: "完成附件差异分析并输出可执行全周期计划",
                    context: contextBase,
                    expectedOutput: "JSON: {summary, deltaScope, tasks[], qaChecklist[], transitionSuggestion}"
                })
            ]
        };
    }
    return {
        strategy: "multi-agent",
        scope,
        objective,
        recommendedTransition,
        executionLoop,
        prompts: [
            buildPrompt({
                agentId: "agent-req-analyst-1",
                role: "requirements-analyst",
                scope,
                goal: "提取附件需求并定位与基线版本差异",
                context: contextBase,
                expectedOutput: "Markdown: 差异矩阵(新增/变更/移除) + 风险点"
            }),
            buildPrompt({
                agentId: "agent-planner-1",
                role: "task-planner",
                scope,
                goal: "将差异转换为迭代任务、优先级和依赖",
                context: contextBase,
                expectedOutput: "JSON: {sprints:[{task,owner,priority,dependsOn}]}"
            }),
            buildPrompt({
                agentId: "agent-delivery-1",
                role: "delivery-engineer",
                scope,
                goal: "输出开发执行计划与回滚策略",
                context: contextBase,
                expectedOutput: "Markdown: 实施步骤 + 回滚预案 + 发布检查点"
            }),
            buildPrompt({
                agentId: "agent-qa-1",
                role: "qa-reviewer",
                scope,
                goal: "生成验收脚本并判定是否进入下一状态",
                context: contextBase,
                expectedOutput: "JSON: {testCases[], acceptanceResultTemplate, recommendedTransition}"
            })
        ]
    };
}
