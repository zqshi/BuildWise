import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from "react";
import type {
  AttachmentAnalysisJob,
  AttachmentAnalysisReport,
  ChatRole,
  Iteration,
  IterationContextPayload,
  IterationMessage,
  IterationStateMachinePayload,
  IterationStatus,
  IterationVisualEditResponse
} from "../domain/workspace/types";
import type { UploadAnalysisProgress, UploadedAttachmentMeta } from "../domain/workspace/analysisTypes";
import {
  analyzeIterationAttachment,
  analyzeIterationAttachmentFolder,
  confirmIterationAnalysis,
  coachIterationMessage,
  createIterationMessage,
  executeIterationVisualEdit,
  fetchIterationReleaseReview,
  generateIterationTestArtifacts,
  rewriteIterationCode,
  recomputeAssessment,
  restoreAssessment,
  updateIterationInteractionState,
  updateClarificationDraft,
  updateIterationBoundary,
  updateIterationTestMatrixExecution,
  transitionIterationState
} from "./workspaceApi";

type UseIterationActionsParams = {
  currentIteration: Iteration | null;
  currentProjectId: number | null;
  currentRole: string;
  contextData: IterationContextPayload | null;
  chatInput: string;
  fileInputRef: RefObject<HTMLInputElement>;
  setChatInput: Dispatch<SetStateAction<string>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setUploadedFile: Dispatch<SetStateAction<UploadedAttachmentMeta | null>>;
  setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>;
  setStateMachine: Dispatch<SetStateAction<IterationStateMachinePayload | null>>;
  setAnalysisReport: Dispatch<SetStateAction<AttachmentAnalysisReport | null>>;
  setShowAnalysisPanel: Dispatch<SetStateAction<boolean>>;
  setIsAnalyzingAttachment: Dispatch<SetStateAction<boolean>>;
  setUploadAnalysisProgress: Dispatch<SetStateAction<UploadAnalysisProgress | null>>;
  loadIterationDetail: (iterationId: number) => Promise<void>;
  loadIterations: (projectId: number) => Promise<void>;
  loadGovernance: () => Promise<void>;
};

export function useIterationActions({
  currentIteration,
  currentProjectId,
  currentRole,
  contextData,
  chatInput,
  fileInputRef,
  setChatInput,
  setBusy,
  setError,
  setUploadedFile,
  setChatMessages,
  setStateMachine,
  setAnalysisReport,
  setShowAnalysisPanel,
  setIsAnalyzingAttachment,
  setUploadAnalysisProgress,
  loadIterationDetail,
  loadIterations,
  loadGovernance
}: UseIterationActionsParams) {
  const resolveUploadErrorMessage = (error: unknown) => {
    const raw = error instanceof Error ? error.message : "Unknown error";
    if (raw.includes("llm_preflight_not_configured")) {
      return "附件分析失败：当前未配置大模型（LLM_API_BASE / LLM_API_KEY）。请联系管理员完成配置。";
    }
    if (raw.includes("llm_preflight_unreachable")) {
      return "附件分析失败：大模型服务当前不可用（鉴权或网络异常）。请检查 LLM_API_KEY/服务连通性后重试。";
    }
    if (raw.includes("request timeout")) {
      return "附件分析失败：请求超时（分析耗时过长）。请减少单次上传文件数量后重试。";
    }
    if (raw.includes("analysis job timeout")) {
      return "附件分析失败：任务执行超时（异步分析未在时限内完成）。建议拆分文件夹后重试。";
    }
    if (raw.includes("analysis job failed")) {
      return "附件分析失败：异步任务执行失败。请重试，若持续失败请检查后端日志。";
    }
    if (raw.includes("API error: 503")) {
      return "附件分析失败：当前未配置大模型服务（LLM_API_BASE）。请联系管理员先完成模型配置。";
    }
    if (raw.includes("aborted")) {
      return "附件分析失败：大模型响应超时（后端已中断本次调用）。请重试，或调大 LLM_REQUEST_TIMEOUT_MS。";
    }
    if (raw.includes("API error: 502")) {
      return "附件分析失败：大模型调用异常，请稍后重试或检查模型服务可达性。";
    }
    if (raw.includes("network unavailable")) {
      return "附件分析失败：后端服务不可达，请检查后端是否已启动。";
    }
    return raw;
  };

  const resolveCoachErrorMessage = (error: unknown) => {
    const raw = error instanceof Error ? error.message : "Unknown error";
    if (raw.includes("API error: 503")) {
      return "对话引导当前未接入大模型（LLM_API_BASE 未配置）。请先完成模型配置后再发送消息。";
    }
    if (raw.includes("API error: 502")) {
      return "对话引导调用大模型失败，请检查模型服务可达性后重试。";
    }
    if (raw.includes("network unavailable") || raw.includes("request timeout")) {
      return "对话发送失败：后端服务不可达，请检查服务状态。";
    }
    return raw;
  };

  const handleUploadClick = () => {
    if (!currentIteration) {
      return;
    }
    fileInputRef.current?.click();
  };

  const toUploadProgress = (job: AttachmentAnalysisJob): UploadAnalysisProgress => {
    const totalBatches = Math.max(1, job.progress.totalBatches || 1);
    const completedBatches = Math.min(totalBatches, Math.max(0, job.progress.completedBatches || 0));
    const failedBatches = Math.max(0, job.progress.failedBatches || 0);
    const effectiveDoneBatches = Math.min(totalBatches, completedBatches + failedBatches);
    const percentByBatches = Math.round((effectiveDoneBatches / totalBatches) * 100);
    const totalFiles = Math.max(1, job.progress.totalFiles || 1);
    const processedFiles = Math.min(totalFiles, Math.max(0, job.progress.processedFiles || 0));
    const percentByFiles = Math.round((processedFiles / totalFiles) * 100);
    const basePercent = Math.max(percentByBatches, percentByFiles);
    if (job.status === "queued") {
      return {
        stage: "queued",
        label: "分析任务已创建，等待执行",
        detail: "任务已进入队列，稍后开始调用大模型。",
        percent: 8,
        jobId: job.jobId
      };
    }
    if (job.status === "running") {
      return {
        stage: "running",
        label: "正在调用大模型分析",
        detail: `批次 ${Math.min(effectiveDoneBatches + 1, totalBatches)}/${totalBatches} · 已处理 ${processedFiles}/${totalFiles} 文件`,
        percent: Math.max(12, Math.min(96, basePercent)),
        jobId: job.jobId
      };
    }
    if (job.status === "succeeded") {
      return {
        stage: "succeeded",
        label: "大模型分析完成",
        detail: `共处理 ${processedFiles}/${totalFiles} 文件，可查看分析报告。`,
        percent: 100,
        jobId: job.jobId
      };
    }
    return {
      stage: "failed",
      label: "大模型分析失败",
      detail: job.error || "分析任务失败，请重试。",
      percent: Math.max(10, basePercent),
      jobId: job.jobId
    };
  };

  const appendMessageLocal = (message: IterationMessage) => {
    setChatMessages((prev) => [...prev, message]);
  };

  const createMessage = async (iterationId: number, role: ChatRole, content: string) => {
    const created = await createIterationMessage(iterationId, role, content);
    appendMessageLocal(created);
  };

  const resolveFolderName = (files: File[]) => {
    const firstPath = ((files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || "").trim();
    if (firstPath.includes("/")) {
      return firstPath.split("/")[0];
    }
    return "attachments";
  };

  const isDocumentAsset = (file: File) => {
    const name = file.name.toLowerCase();
    const type = (file.type || "").toLowerCase();
    return (
      type.startsWith("text/") ||
      type.includes("pdf") ||
      type.includes("word") ||
      type.includes("markdown") ||
      name.endsWith(".md") ||
      name.endsWith(".txt") ||
      name.endsWith(".doc") ||
      name.endsWith(".docx") ||
      name.endsWith(".pdf")
    );
  };

  const isPrototypeAsset = (file: File) => {
    const name = file.name.toLowerCase();
    const path = ((file as File & { webkitRelativePath?: string }).webkitRelativePath || "").toLowerCase();
    const type = (file.type || "").toLowerCase();
    const marker = `${name} ${path}`;
    return (
      type.startsWith("image/") ||
      type.includes("svg") ||
      name.endsWith(".fig") ||
      name.endsWith(".sketch") ||
      name.endsWith(".xd") ||
      name.endsWith(".html") ||
      name.endsWith(".htm") ||
      /prototype|wireframe|mockup|交互|原型|界面|figma/.test(marker)
    );
  };

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    if (!currentIteration) {
      return;
    }
    const hasFolderPath = files.some((item) => Boolean((item as File & { webkitRelativePath?: string }).webkitRelativePath));
    const isBatch = hasFolderPath || files.length > 1;
    const folderName = resolveFolderName(files);
    const hasDocumentAssets = files.some(isDocumentAsset);
    const hasPrototypeAssets = files.some(isPrototypeAsset);
    const uploadKind = hasDocumentAssets && hasPrototypeAssets ? "mixed" : hasDocumentAssets ? "documents" : hasPrototypeAssets ? "prototype" : "other";
    const prototypeItems = files
      .map((item) => ((item as File & { webkitRelativePath?: string }).webkitRelativePath || item.name || "").trim())
      .filter((item) => item.length > 0)
      .filter((item) => /prototype|wireframe|mockup|交互|原型|界面|figma|\.fig$|\.xd$|\.sketch$|\.html?$|\.png$|\.jpg$|\.jpeg$|\.svg$/i.test(item))
      .slice(0, 12);
    const htmlPreviewCandidates = files.filter((item) => /\.html?$/i.test(item.name || "")).slice(0, 3);
    const htmlPreviews = (
      await Promise.all(
        htmlPreviewCandidates.map(async (item) => {
          try {
            const content = await item.text();
            if (!content.trim()) {
              return null;
            }
            const cappedContent = content.length > 300_000 ? content.slice(0, 300_000) : content;
            const path = ((item as File & { webkitRelativePath?: string }).webkitRelativePath || item.name || "").trim();
            return {
              name: item.name,
              path: path || item.name,
              content: cappedContent
            };
          } catch {
            return null;
          }
        })
      )
    ).filter((item): item is { name: string; path: string; content: string } => Boolean(item));
    const imagePreviewCandidates = files.filter((item) => /^image\//i.test(item.type || "") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(item.name || "")).slice(0, 6);
    const imagePreviews = (
      await Promise.all(
        imagePreviewCandidates.map(
          (item) =>
            new Promise<{ name: string; path: string; dataUrl: string } | null>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = typeof reader.result === "string" ? reader.result : "";
                if (!dataUrl) {
                  resolve(null);
                  return;
                }
                const path = ((item as File & { webkitRelativePath?: string }).webkitRelativePath || item.name || "").trim();
                resolve({
                  name: item.name,
                  path: path || item.name,
                  dataUrl
                });
              };
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(item);
            })
        )
      )
    ).filter((item): item is { name: string; path: string; dataUrl: string } => Boolean(item));
    setUploadedFile({
      name: isBatch ? `${folderName} (${files.length} files)` : files[0].name,
      iterationId: currentIteration.id,
      hasDocumentAssets,
      hasPrototypeAssets,
      uploadKind,
      prototypeItems,
      htmlPreviews,
      imagePreviews
    });
    try {
      await updateIterationInteractionState(currentIteration.id, {
        hasPrototypeAssets,
        uploadKind,
        lastAttachmentName: isBatch ? `${folderName} (${files.length} files)` : files[0].name
      });
      await loadIterations(currentProjectId ?? currentIteration.projectId);
    } catch {
      // keep upload flow usable even if state persistence fails
    }
    try {
      setIsAnalyzingAttachment(true);
      setUploadAnalysisProgress({
        stage: "preparing",
        label: "正在准备上传内容",
        detail: "正在读取文件并构建分析上下文...",
        percent: 5
      });
      try {
        await createMessage(currentIteration.id, "system", isBatch ? `已上传附件：${folderName}（${files.length} 个文件）` : `已上传附件：${files[0].name}`);
      } catch {
        // ignore upload event message failure
      }
      if (hasPrototypeAssets && !hasDocumentAssets) {
        setAnalysisReport(null);
        setShowAnalysisPanel(false);
        setUploadAnalysisProgress({
          stage: "succeeded",
          label: "原型已上传",
          detail: "仅原型素材无需调用大模型分析，可直接进入交互渲染模式。",
          percent: 100
        });
        await createMessage(
          currentIteration.id,
          "assistant",
          htmlPreviews.length > 0
            ? "检测到 HTML 原型附件，已进入交互渲染模式。你可以点击“交互界面”查看上传的页面。"
            : "检测到可交互原型附件，已进入交互渲染模式。你可以点击“交互界面”并选中元素后，通过 IM 描述修改指令。"
        );
        return;
      }
      const report = isBatch
        ? await analyzeIterationAttachmentFolder(currentIteration.id, files, {
            folderName,
            agentScope: "full-cycle",
            forceMultiAgent: true,
            autoTransition: false,
            onJobUpdate: (job) => setUploadAnalysisProgress(toUploadProgress(job))
          })
        : await analyzeIterationAttachment(currentIteration.id, files[0], {
            agentScope: "full-cycle",
            forceMultiAgent: true,
            autoTransition: false,
            onJobUpdate: (job) => setUploadAnalysisProgress(toUploadProgress(job))
          });
      setAnalysisReport(report);
      setShowAnalysisPanel(false);
      setUploadAnalysisProgress((prev) =>
        prev?.stage === "succeeded"
          ? prev
          : {
              stage: "succeeded",
              label: "大模型分析完成",
              detail: "分析报告已生成，可点击“查看分析报告”。",
              percent: 100
            }
      );
      await createMessage(
        currentIteration.id,
        "assistant",
        "附件已完成大模型分析，点击“查看分析报告”查看项目识别、产品识别与关键发现。"
      );
      if ((report.clarificationQuestions?.length ?? 0) > 0) {
        await createMessage(
          currentIteration.id,
          "assistant",
          `我先发起澄清：${report.clarificationQuestions[0]}。请直接在对话中回复，我会持续收敛问题；当全部澄清完成后，回复“确认分析”即可完成确认。`
        );
      }
      await loadGovernance();
    } catch (err) {
      const message = resolveUploadErrorMessage(err);
      setError(message);
      setUploadAnalysisProgress({
        stage: "failed",
        label: "大模型分析失败",
        detail: message,
        percent: 15
      });
      try {
        await createMessage(currentIteration.id, "system", message);
      } catch {
        // ignore secondary message failure
      }
    } finally {
      setIsAnalyzingAttachment(false);
    }
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    await uploadFiles(files);
    event.target.value = "";
  };

  const handleSend = async (options?: {
    overrideText?: string;
    prototypeTarget?: string | null;
    prototypeSummary?: string;
    interactionContext?: {
      mode?: "html" | "image" | "prototype";
      target?: string;
      summary?: string;
      html?: {
        selector?: string;
        tag?: string;
        text?: string;
        styles?: Record<string, string>;
      };
    };
  }): Promise<IterationVisualEditResponse | null> => {
    const text = (options?.overrideText ?? chatInput).trim();
    if (!text || !currentIteration) {
      return null;
    }
    setChatInput("");
    try {
      await createMessage(currentIteration.id, "user", text);
      if (options?.prototypeTarget) {
        const visualEditResult = await executeIterationVisualEdit(currentIteration.id, {
          message: text,
          target: {
            mode: options.interactionContext?.mode || "prototype",
            target: options.interactionContext?.target || options.prototypeTarget || "",
            summary: options.interactionContext?.summary || options.prototypeSummary || "",
            html: options.interactionContext?.html
          }
        });
        await createMessage(
          currentIteration.id,
          "assistant",
          `可视化编辑执行结果（目标：${visualEditResult.target.target}）：${visualEditResult.summary}`
        );
        if (visualEditResult.warnings.length > 0) {
          await createMessage(currentIteration.id, "system", `操作建议：${visualEditResult.warnings.join("；")}`);
        }
        return visualEditResult;
      }
      const rewriteMatch = text.match(/^(代码改写|增量改写|rewrite)\s*[:：]\s*(.+)$/i);
      const applyMatch = text.match(/^(执行代码改写|apply rewrite)\s*[:：]\s*(.+)$/i);
      if (rewriteMatch || applyMatch) {
        const instruction = (rewriteMatch?.[2] || applyMatch?.[2] || "").trim();
        if (!instruction) {
          await createMessage(currentIteration.id, "assistant", "请在“代码改写: ...”后补充具体改写指令。");
          return null;
        }
        const rewrite = await rewriteIterationCode(currentIteration.id, {
          instruction,
          dryRun: !applyMatch,
          maxFiles: 6
        });
        const header = rewrite.dryRun ? "边界内改写预览（dry-run）" : "边界内改写已执行";
        const changed = rewrite.edits.map((item) => item.path).join("；") || "无变更";
        await createMessage(currentIteration.id, "assistant", `${header}：${rewrite.summary}\n变更文件：${changed}`);
        if (rewrite.outOfBoundaryFiles.length > 0) {
          await createMessage(currentIteration.id, "system", `越界阻断：${rewrite.outOfBoundaryFiles.join("；")}`);
        }
        await loadIterationDetail(currentIteration.id);
        return null;
      }
      const clarificationQuestions = currentIteration.changeControl?.clarificationQuestions ?? [];
      const resolvedQuestions = currentIteration.changeControl?.clarificationDraftResolvedQuestions ?? [];
      const unresolvedQuestions = clarificationQuestions.filter((item) => !resolvedQuestions.includes(item));
      const shouldConfirm =
        /确认分析|确认无误|可以确认|确认吧|确认通过|全部澄清完成|确认一致|理解一致|按此执行/.test(text) &&
        currentIteration.changeControl?.pendingHumanConfirmation;
      if (currentIteration.changeControl?.pendingHumanConfirmation) {
        if (/偏差点|不一致|理解偏差|有偏差/.test(text)) {
          await confirmIterationAnalysis(currentIteration.id, {
            accurate: false,
            note: text,
            actor: currentRole,
            resolvedClarificationQuestions: resolvedQuestions
          });
          await createMessage(
            currentIteration.id,
            "assistant",
            "已收到偏差反馈。我会按你指出的偏差点继续收敛理解，请继续补充你期望的目标、边界和成功标准。"
          );
          await loadIterationDetail(currentIteration.id);
          if (currentProjectId) {
            await loadIterations(currentProjectId);
          }
          await loadGovernance();
          return null;
        }
        if (unresolvedQuestions.length > 0) {
          const currentQuestion = unresolvedQuestions[0];
          const nextResolved = Array.from(new Set([...resolvedQuestions, currentQuestion]));
          await updateClarificationDraft(currentIteration.id, nextResolved);
          await loadIterationDetail(currentIteration.id);
          const remaining = unresolvedQuestions.slice(1);
          if (remaining.length > 0) {
            await createMessage(
              currentIteration.id,
              "assistant",
              `收到，已记录本轮澄清。下一项请确认：${remaining[0]}`
            );
          } else {
            await createMessage(
              currentIteration.id,
              "assistant",
              "澄清问题已收敛。请回复“确认分析”或“确认分析并锁定边界”，我将完成最终确认。"
            );
          }
          return null;
        }
        if (shouldConfirm) {
          await confirmIterationAnalysis(currentIteration.id, {
            accurate: true,
            note: text,
            actor: currentRole,
            resolvedClarificationQuestions: resolvedQuestions
          });
          await createMessage(currentIteration.id, "assistant", "已完成分析确认。后续可继续在 IM 中沟通任务拆解、测试与发布动作。");
          await loadIterationDetail(currentIteration.id);
          if (currentProjectId) {
            await loadIterations(currentProjectId);
          }
          await loadGovernance();
          return null;
        }
      }
      const coach = await coachIterationMessage(currentIteration.id, text);
      await createMessage(currentIteration.id, "assistant", coach.reply);
      const intentPriorityMap: Record<string, "P0" | "P1" | "P2"> = {
        release: "P0",
        qa: "P1",
        "confirm-boundary": "P1",
        clarify: "P1",
        "collect-attachment": "P1",
        plan: "P2",
        general: "P2"
      };
      const prerequisites = [
        coach.guidance?.uploadRecommended ? "先上传本轮附件材料（需求文档/原型/接口变更）" : "",
        (coach.guidance?.clarificationChecklist?.length || 0) > 0 ? "先完成关键澄清项确认" : ""
      ].filter(Boolean);
      const guidancePayload = {
        intent: coach.intent,
        priority: intentPriorityMap[coach.intent] || "P2",
        uploadRecommended: Boolean(coach.guidance?.uploadRecommended),
        actions: coach.guidance?.suggestedActions?.slice(0, 4) || [],
        checklist: coach.guidance?.clarificationChecklist?.slice(0, 4) || [],
        prerequisites
      };
      if (guidancePayload.actions.length > 0 || guidancePayload.checklist.length > 0 || guidancePayload.uploadRecommended) {
        await createMessage(currentIteration.id, "system", `操作建议JSON:${JSON.stringify(guidancePayload)}`);
      }
      await loadIterationDetail(currentIteration.id);
      return null;
    } catch (err) {
      setError(resolveCoachErrorMessage(err));
      return null;
    }
  };

  const handleRecomputeAssessment = async () => {
    if (!currentIteration) {
      return;
    }
    try {
      setBusy(true);
      await recomputeAssessment(currentIteration.id);
      await loadIterationDetail(currentIteration.id);
      await loadGovernance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreSnapshot = async (snapshotId: number) => {
    if (!currentIteration) {
      return;
    }
    try {
      setBusy(true);
      await restoreAssessment(currentIteration.id, snapshotId);
      if (currentProjectId) {
        await loadIterations(currentProjectId);
      }
      await loadIterationDetail(currentIteration.id);
      await loadGovernance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const handleTransitionState = async (toStatus: IterationStatus) => {
    if (!currentIteration) {
      return;
    }
    try {
      setBusy(true);
      await transitionIterationState(currentIteration.id, { toStatus });
      if (currentProjectId) {
        await loadIterations(currentProjectId);
      }
      await loadIterationDetail(currentIteration.id);
      await loadGovernance();
      setStateMachine((prev) =>
        prev
          ? {
              ...prev,
              currentStatus: toStatus
            }
          : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateClarificationDraft = async (resolvedQuestions: string[]) => {
    if (!currentIteration) {
      return;
    }
    try {
      setBusy(true);
      await updateClarificationDraft(currentIteration.id, resolvedQuestions);
      await loadIterationDetail(currentIteration.id);
      await loadGovernance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmIterationAnalysis = async (payload: {
    accurate: boolean;
    note?: string;
    resolvedClarificationQuestions?: string[];
    boundary?: {
      requirementRefs?: string[];
      componentRefs?: string[];
      codePaths?: string[];
      note?: string;
    };
  }) => {
    if (!currentIteration) {
      return;
    }
    try {
      setBusy(true);
      await confirmIterationAnalysis(currentIteration.id, {
        ...payload,
        actor: currentRole
      });
      await loadIterationDetail(currentIteration.id);
      if (currentProjectId) {
        await loadIterations(currentProjectId);
      }
      await loadGovernance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateIterationBoundary = async (payload: {
    requirementRefs?: string[];
    componentRefs?: string[];
    codePaths?: string[];
    note?: string;
  }) => {
    if (!currentIteration) {
      return;
    }
    try {
      setBusy(true);
      await updateIterationBoundary(currentIteration.id, payload);
      await loadIterationDetail(currentIteration.id);
      await loadGovernance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateTestMatrixExecution = async (
    updates: Array<{ caseId: string; status: "pending" | "passed" | "failed" | "blocked" | "skipped"; by?: string; note?: string }>
  ) => {
    if (!currentIteration || updates.length === 0) {
      return;
    }
    try {
      setBusy(true);
      await updateIterationTestMatrixExecution(currentIteration.id, updates);
      await loadIterationDetail(currentIteration.id);
      await loadGovernance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateTestArtifacts = async (dryRun = true) => {
    if (!currentIteration) {
      return;
    }
    try {
      setBusy(true);
      const result = await generateIterationTestArtifacts(currentIteration.id, { dryRun });
      setAnalysisReport((prev) =>
        prev
          ? {
              ...prev,
              qualityArtifacts: {
                ...prev.qualityArtifacts,
                materializedFiles: result.generatedFiles
              }
            }
          : prev
      );
      await createMessage(
        currentIteration.id,
        "assistant",
        `${result.summary}\n产物文件：${result.generatedFiles.join("；") || "无"}`
      );
      await loadIterationDetail(currentIteration.id);
      await loadGovernance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  const handleRefreshReleaseReview = async () => {
    if (!currentIteration) {
      return;
    }
    try {
      setBusy(true);
      const review = await fetchIterationReleaseReview(currentIteration.id);
      setAnalysisReport((prev) =>
        prev
          ? {
              ...prev,
              releaseReview: {
                decision: review.decision,
                reason: `score=${review.score}; ${review.blockers[0] || review.warnings[0] || "无明显阻断"}`,
                blockers: review.blockers,
                releaseGates: [],
                recommendations: review.recommendations,
                rollback: review.rollback,
                qualitySignals: {
                  testCaseCount: prev.releaseReview?.qualitySignals?.testCaseCount || 0,
                  p0FindingCount: prev.releaseReview?.qualitySignals?.p0FindingCount || 0,
                  unknownSignalCount: prev.releaseReview?.qualitySignals?.unknownSignalCount || 0,
                  boundaryCoverage: review.evidence.boundaryReady ? 100 : 60
                }
              }
            }
          : prev
      );
      await createMessage(
        currentIteration.id,
        "assistant",
        `发布评审刷新：${review.decision.toUpperCase()}（score=${review.score}）`
      );
      await loadGovernance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  };

  return {
    handleUploadClick,
    handleUpload,
    uploadFiles,
    handleSend,
    handleRecomputeAssessment,
    handleRestoreSnapshot,
    handleTransitionState,
    handleUpdateClarificationDraft,
    handleConfirmIterationAnalysis,
    handleUpdateIterationBoundary,
    handleUpdateTestMatrixExecution,
    handleGenerateTestArtifacts,
    handleRefreshReleaseReview
  };
}
