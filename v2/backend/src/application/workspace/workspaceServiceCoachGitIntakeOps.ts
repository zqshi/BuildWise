import type { WorkspaceRepository } from "../../domain/workspace/repository";
import type { Iteration, IterationCoachChatResponse, ProjectRepository } from "../../domain/workspace/types";
import {
  detectGitRequirementReadDecision,
  hasGitRequirementIntakeTarget,
  readGitRepositoryRequirementSnapshot
} from "./workspaceServiceGitRequirementIntakeOps";
import { defaultIterationChangeControl, writeAuditLog } from "./workspaceServiceCommon";
import { ensureArtifactWorkflow } from "./workspaceServiceChangeControlArtifactWorkflow";
import { runOpenclawSkillChainForCoach } from "./workspaceOpenclawSkillsBridge";

function defaultInteractionState(iteration: Iteration, now: string) {
  return {
    hasPrototypeAssets: iteration.interactionState?.hasPrototypeAssets ?? false,
    uploadKind: iteration.interactionState?.uploadKind || "other",
    lastUpdatedAt: now,
    lastAttachmentName: iteration.interactionState?.lastAttachmentName || ""
  };
}

function pickActions(skillActions: string[], fallback: string[], max = 6) {
  const merged = [...skillActions, ...fallback].map((item) => item.trim()).filter(Boolean);
  return Array.from(new Set(merged)).slice(0, max);
}

function pickChecklist(skillChecklist: string[], fallback: string[], max = 6) {
  const merged = [...skillChecklist, ...fallback].map((item) => item.trim()).filter(Boolean);
  return Array.from(new Set(merged)).slice(0, max);
}

function waitingResponse(input: {
  iterationId: number;
  repoUrl: string;
  branch: string;
  summaries: string[];
  suggestedActions: string[];
  checklist: string[];
}): IterationCoachChatResponse {
  const summaryLine = input.summaries.length > 0 ? `当前线索：${input.summaries.slice(0, 1).join("；")}。` : "";
  const repoHint = input.repoUrl ? `目标仓库：${input.repoUrl}（${input.branch || "main"}）。` : "";
  return {
    iterationId: input.iterationId,
    intent: "general",
    reply: `${repoHint}${summaryLine}请先给出本轮选择：读取仓库，或暂不读取。`,
    execution: { action: "none", instruction: "", apply: false },
    guidance: {
      uploadRecommended: false,
      suggestedUploadTypes: ["requirements-doc", "folder-upload"],
      suggestedActions: pickActions(input.suggestedActions, ["读取仓库", "暂不读取"]),
      clarificationChecklist: pickChecklist(input.checklist, ["确认是否先读取仓库"])
    },
    llm: {
      used: false,
      model: "",
      degraded: false,
      reason: "git-intake-waiting-confirmation"
    }
  };
}

function acceptedResponse(input: {
  iterationId: number;
  summary: string;
  ok: boolean;
  error: string;
  suggestedActions: string[];
  checklist: string[];
  summaries: string[];
}): IterationCoachChatResponse {
  const summaryLine = input.summaries.length > 0 ? `补充线索：${input.summaries.slice(0, 1).join("；")}。` : "";
  return {
    iterationId: input.iterationId,
    intent: "plan",
    reply: input.ok
      ? [
          "已完成仓库读取，并生成本轮分析。",
          input.summary,
          summaryLine,
          "请确认分析是否准确；确认后继续推进边界与任务拆解。"
        ]
          .filter(Boolean)
          .join("\n\n")
      : `尝试读取仓库失败：${input.error || "unknown_error"}。你可以先走需求沟通流程，或上传文档/文件夹继续分析。`,
    execution: { action: "none", instruction: "", apply: false },
    guidance: {
      uploadRecommended: !input.ok,
      suggestedUploadTypes: input.ok ? ["requirements", "prototype", "api-change"] : ["requirements-doc", "folder-upload"],
      suggestedActions: input.ok
        ? pickActions(input.suggestedActions, ["确认分析准确性", "确认版本目标", "确认验收标准"])
        : pickActions(input.suggestedActions, ["补充需求说明", "上传文档或文件夹", "确认后进入任务拆解"]),
      clarificationChecklist: input.ok
        ? pickChecklist(input.checklist, ["仓库分析结论是否准确", "版本目标是否一致", "验收标准是否可测试"])
        : pickChecklist(input.checklist, ["当前版本核心目标", "必须完成功能", "不可触碰范围"])
    },
    llm: {
      used: false,
      model: "",
      degraded: false,
      reason: "git-intake-deterministic-branch"
    }
  };
}

function buildGitAnalysisReport(snapshot: {
  branch: string;
  summary: string;
  highlights: string[];
  repoUrl: string;
}) {
  const highlights = snapshot.highlights.length > 0 ? snapshot.highlights.slice(0, 6) : ["未提取到结构线索"];
  const lines = [
    "【仓库需求分析报告】",
    `仓库：${snapshot.repoUrl}`,
    `分支：${snapshot.branch}`,
    "结论：",
    snapshot.summary || "已完成读取，但未提取到可用摘要。",
    "关键线索：",
    ...highlights.map((item) => `- ${item}`),
    "待确认：请确认分析是否准确，并指出遗漏需求。"
  ];
  return lines.join("\n");
}

function declinedResponse(input: {
  iterationId: number;
  suggestedActions: string[];
  checklist: string[];
  summaries: string[];
}): IterationCoachChatResponse {
  const summaryLine = input.summaries.length > 0 ? `当前线索：${input.summaries.slice(0, 1).join("；")}。` : "";
  return {
    iterationId: input.iterationId,
    intent: "collect-attachment",
    reply: `收到，本轮先不读取仓库。${summaryLine}你可以直接上传文档/文件夹，我会基于材料继续推进迭代分析。`,
    execution: { action: "none", instruction: "", apply: false },
    guidance: {
      uploadRecommended: true,
      suggestedUploadTypes: ["requirements-doc", "prototype", "folder-upload"],
      suggestedActions: pickActions(input.suggestedActions, ["明确版本目标和验收标准", "补充 inScope/outOfScope", "上传附件后进入分析"]),
      clarificationChecklist: pickChecklist(input.checklist, ["本版本最核心目标", "必须完成的功能点", "不可触碰的范围"])
    },
    llm: {
      used: false,
      model: "",
      degraded: false,
      reason: "git-intake-declined-branch"
    }
  };
}

export function handlePendingGitRequirementIntake(params: {
  repo: WorkspaceRepository;
  iteration: Iteration;
  projectRepo: ProjectRepository | null;
  userMessage: string;
}): IterationCoachChatResponse | null {
  const { repo, iteration, projectRepo, userMessage } = params;
  const gitIntake = iteration.interactionState?.gitRequirementIntake;
  const pending =
    gitIntake?.status === "pending-confirmation" &&
    hasGitRequirementIntakeTarget(projectRepo) &&
    Boolean(gitIntake.repoUrl && gitIntake.branch);
  if (!pending || !projectRepo || !gitIntake) {
    return null;
  }
  const decision = detectGitRequirementReadDecision(userMessage);
  const skillChain = runOpenclawSkillChainForCoach({
    iteration,
    previousIterationName: "",
    userMessage: `[git-intake:${decision}] ${userMessage}`
  });
  const now = new Date().toISOString();
  if (decision === "unknown") {
    return waitingResponse({
      iterationId: iteration.id,
      repoUrl: gitIntake.repoUrl,
      branch: gitIntake.branch,
      summaries: skillChain.summaries,
      suggestedActions: skillChain.suggestedActions,
      checklist: skillChain.checklist
    });
  }
  if (decision === "decline") {
    repo.updateIteration({
      ...iteration,
      interactionState: {
        ...defaultInteractionState(iteration, now),
        gitRequirementIntake: {
          status: "declined",
          askedAt: gitIntake.askedAt || now,
          decidedAt: now,
          branch: gitIntake.branch,
          repoUrl: gitIntake.repoUrl,
          summary: "",
          error: ""
        }
      }
    });
    writeAuditLog(repo, "iteration_git_intake_declined", `iteration:${iteration.id}`, `repo=${gitIntake.repoUrl}`);
    return declinedResponse({
      iterationId: iteration.id,
      suggestedActions: skillChain.suggestedActions,
      checklist: skillChain.checklist,
      summaries: skillChain.summaries
    });
  }
  const snapshot = readGitRepositoryRequirementSnapshot({
    repoUrl: gitIntake.repoUrl,
    branch: gitIntake.branch
  });
  const nextStatus: "accepted-read" | "read-failed" = snapshot.ok ? "accepted-read" : "read-failed";
  const currentControl = iteration.changeControl ?? defaultIterationChangeControl();
  const analysisSummary = snapshot.ok
    ? buildGitAnalysisReport({
        branch: gitIntake.branch,
        summary: snapshot.summary,
        highlights: snapshot.highlights,
        repoUrl: gitIntake.repoUrl
      })
    : "";
  const nextControl = snapshot.ok
    ? {
        ...currentControl,
        pendingHumanConfirmation: true,
        lastAnalysisAt: now,
        lastAnalysisFileName: "git-repository-intake",
        lastAnalysisDigest: `repo=${gitIntake.repoUrl};branch=${gitIntake.branch}`,
        clarificationQuestions: ["请确认《仓库需求分析报告》是否准确。"],
        clarificationDraftResolvedQuestions: [],
        clarificationDraftUpdatedAt: now,
        lastClarificationResolution: {
          resolvedQuestions: [],
          unresolvedQuestions: ["请确认《仓库需求分析报告》是否准确。"],
          updatedAt: now
        },
        lastClarificationNote: "等待用户确认仓库需求分析报告",
        confirmedAt: "",
        confirmedBy: "",
        lastReportPublishable: true,
        lastReportQualityScore: 88,
        lastReportQualitySummary: "已基于仓库结构与文档生成首轮需求分析报告，待人工确认。",
        lastReportQualityUpdatedAt: now,
        artifactWorkflow: ensureArtifactWorkflow(
          iteration,
          {
            ...currentControl,
            pendingHumanConfirmation: true,
            lastAnalysisAt: now,
            lastAnalysisFileName: "git-repository-intake",
            lastAnalysisDigest: `repo=${gitIntake.repoUrl};branch=${gitIntake.branch}`,
            lastReportPublishable: true,
            lastReportQualityScore: 88,
            lastReportQualitySummary: "已基于仓库结构与文档生成首轮需求分析报告，待人工确认。",
            lastReportQualityUpdatedAt: now
          },
          now
        )
      }
    : currentControl;
  repo.updateIteration({
    ...iteration,
    changeControl: nextControl,
    interactionState: {
      ...defaultInteractionState(iteration, now),
      gitRequirementIntake: {
        status: nextStatus,
        askedAt: gitIntake.askedAt || now,
        decidedAt: now,
        branch: gitIntake.branch,
        repoUrl: gitIntake.repoUrl,
        summary: analysisSummary || snapshot.summary,
        error: snapshot.error
      }
    }
  });
  writeAuditLog(
    repo,
    snapshot.ok ? "iteration_git_intake_read_succeeded" : "iteration_git_intake_read_failed",
    `iteration:${iteration.id}`,
    `branch=${gitIntake.branch};repo=${gitIntake.repoUrl};error=${snapshot.error || "none"}`
  );
  return acceptedResponse({
    iterationId: iteration.id,
    summary: analysisSummary || snapshot.summary,
    ok: snapshot.ok,
    error: snapshot.error,
    suggestedActions: skillChain.suggestedActions,
    checklist: skillChain.checklist,
    summaries: skillChain.summaries
  });
}
