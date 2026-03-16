import { useRef, useState } from "react";
import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from "react";
import type {
  AttachmentAnalysisJob,
  AttachmentAnalysisReport,
  ChatSendStatus,
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
  retryIterationAttachmentAnalysis,
  confirmIterationAnalysis,
  coachIterationMessage,
  createIterationMessage,
  executeIterationVisualEdit,
  fetchIterationReleaseReview,
  generateIterationTestArtifacts,
  fetchIterationArtifactWorkflow,
  runIterationFullCycle,
  rewriteIterationCode,
  saveIterationArtifactDraft,
  commitIterationArtifact,
  confirmIterationArtifact,
  appendIterationArtifactToChat,
  transitionIterationArtifactStage,
  recomputeAssessment,
  restoreAssessment,
  updateIterationInteractionState,
  updateClarificationDraft,
  updateIterationBoundary,
  updateIterationTestMatrixExecution,
  transitionIterationState
} from "./workspaceApi";
import { buildCoachFollowupMessage } from "./coachConversationGuide";

type UseIterationActionsParams = {
  currentIteration: Iteration | null;
  currentProjectId: number | null;
  currentRole: string;
  contextData: IterationContextPayload | null;
  analysisReport: AttachmentAnalysisReport | null;
  uploadedFile: UploadedAttachmentMeta | null;
  chatInput: string;
  fileInputRef: RefObject<HTMLInputElement>;
  setChatInput: Dispatch<SetStateAction<string>>;
  setChatSendStatus: Dispatch<SetStateAction<ChatSendStatus>>;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setUploadedFile: Dispatch<SetStateAction<UploadedAttachmentMeta | null>>;
  setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>;
  setStateMachine: Dispatch<SetStateAction<IterationStateMachinePayload | null>>;
  setAnalysisReport: Dispatch<SetStateAction<AttachmentAnalysisReport | null>>;
  setShowAnalysisPanel: Dispatch<SetStateAction<boolean>>;
  setIsAnalyzingAttachment: Dispatch<SetStateAction<boolean>>;
  setUploadAnalysisProgress: Dispatch<SetStateAction<UploadAnalysisProgress | null>>;
  setUploadToastMessage: Dispatch<SetStateAction<string | null>>;
  loadIterationDetail: (iterationId: number) => Promise<void>;
  loadIterations: (projectId: number) => Promise<void>;
  loadGovernance: () => Promise<void>;
};

export function useIterationActions({
  currentIteration,
  currentProjectId,
  currentRole,
  contextData,
  analysisReport,
  uploadedFile,
  chatInput,
  fileInputRef,
  setChatInput,
  setChatSendStatus,
  setBusy,
  setError,
  setUploadedFile,
  setChatMessages,
  setStateMachine,
  setAnalysisReport,
  setShowAnalysisPanel,
  setIsAnalyzingAttachment,
  setUploadAnalysisProgress,
  setUploadToastMessage,
  loadIterationDetail,
  loadIterations,
  loadGovernance
}: UseIterationActionsParams) {
  const lastUploadAttemptRef = useRef<{ iterationId: number; files: File[] } | null>(null);
  const [lastUploadFailed, setLastUploadFailed] = useState(false);

  const buildAutoFullCycleAnalysisInput = () => {
    if (!currentIteration) {
      return undefined;
    }
    const hasCachedAnalysis = Boolean(analysisReport?.iterationId === currentIteration.id);
    const canAutoAnalyzeFromUpload =
      !hasCachedAnalysis &&
      Boolean(uploadedFile) &&
      ((uploadedFile?.htmlPreviews?.length || 0) > 0 || (uploadedFile?.imagePreviews?.length || 0) > 0);
    if (!canAutoAnalyzeFromUpload) {
      return undefined;
    }
    const firstHtmlPreview = uploadedFile?.htmlPreviews?.[0];
    const firstImagePreview = uploadedFile?.imagePreviews?.[0];
    return {
      fileName: uploadedFile?.name || "uploaded-asset",
      mimeType: firstHtmlPreview ? "text/html" : "image/*",
      size: firstHtmlPreview?.content?.length || firstImagePreview?.dataUrl?.length || 0,
      excerpt: (firstHtmlPreview?.content || "").slice(0, 4000),
      sourceType: "single-file" as const,
      visionPayloads: firstImagePreview?.dataUrl
        ? [
            {
              path: firstImagePreview.path || firstImagePreview.name || uploadedFile?.name || "uploaded-image",
              mimeType: "image/*",
              dataUrl: firstImagePreview.dataUrl
            }
          ]
        : [],
      agentScope: "full-cycle" as const,
      forceMultiAgent: true
    };
  };

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
    if (raw.includes("report_not_llm_quality")) {
      return "附件分析失败：大模型输出质量不足（已禁止兜底文案）。请补充更清晰的业务文档后重试。";
    }
    if (raw.includes("analysis job stalled")) {
      return "附件分析失败：任务长时间无进展，已自动终止以避免卡住。请拆分文件夹或稍后重试。";
    }
    if (raw.includes("analysis job polling failed")) {
      return `附件分析失败：任务状态轮询异常，已自动停止等待。请检查后端服务后重试。详情：${raw}`;
    }
    if (raw.includes("API error: 503")) {
      return "附件分析失败：当前未配置大模型服务（LLM_API_BASE）。请联系管理员先完成模型配置。";
    }
    if (raw.includes("API error: 409") || raw.includes("duplicate_upload")) {
      return "检测到重复上传：当前迭代已存在相同文档内容，请仅上传增量文档。";
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
      const llmCallCount = Math.max(0, job.progress.llmCallCount || 0);
      const llmInFlightCount = Math.max(0, job.progress.llmInFlightCount || 0);
      const llmFailureCount = Math.max(0, job.progress.llmFailureCount || 0);
      const llmLastCallTime = job.progress.lastLlmCallAt
        ? new Date(job.progress.lastLlmCallAt).toLocaleTimeString("zh-CN", { hour12: false })
        : "无";
      const stageHint = (job.progress.stageHint || "").trim();
      return {
        stage: "running",
        label: "正在调用大模型分析",
        detail: `批次 ${Math.min(effectiveDoneBatches + 1, totalBatches)}/${totalBatches} · 已处理 ${processedFiles}/${totalFiles} 文件 · LLM调用 ${llmCallCount} 次（进行中 ${llmInFlightCount} / 失败 ${llmFailureCount}）· 最近调用 ${llmLastCallTime}${stageHint ? ` · 阶段 ${stageHint}` : ""}`,
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
    if (job.status === "partial_succeeded") {
      return {
        stage: "succeeded",
        label: "分析部分完成",
        detail:
          job.warnings.length > 0
            ? `已处理 ${processedFiles}/${totalFiles} 文件，部分批次失败：${job.warnings[0]}`
            : `已处理 ${processedFiles}/${totalFiles} 文件，存在部分未完成项。`,
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

  const hashFingerprint = (raw: string) => {
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i += 1) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };

  const buildUploadFingerprint = (files: File[]) => {
    const hasFolderPath = files.some((item) => Boolean((item as File & { webkitRelativePath?: string }).webkitRelativePath));
    const sourceType = hasFolderPath || files.length > 1 ? "folder" : "single-file";
    const normalizedFiles = files
      .map((item) => ({
        path: ((item as File & { webkitRelativePath?: string }).webkitRelativePath || item.name || "").trim(),
        name: (item.name || "").trim(),
        size: Number.isFinite(item.size) ? item.size : 0,
        type: (item.type || "").trim().toLowerCase(),
        lastModified: Number.isFinite(item.lastModified) ? item.lastModified : 0
      }))
      .sort((a, b) => `${a.path}|${a.name}`.localeCompare(`${b.path}|${b.name}`));
    const raw = JSON.stringify({ sourceType, files: normalizedFiles });
    return `afp-${hashFingerprint(raw)}`;
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
    setLastUploadFailed(false);
    lastUploadAttemptRef.current = {
      iterationId: currentIteration.id,
      files: [...files]
    };
    const hasFolderPath = files.some((item) => Boolean((item as File & { webkitRelativePath?: string }).webkitRelativePath));
    const isBatch = hasFolderPath || files.length > 1;
    const folderName = resolveFolderName(files);
    const uploadFingerprint = buildUploadFingerprint(files);
    const latestIterationFingerprint = currentIteration.changeControl?.lastUploadedInputFingerprint?.trim() || "";
    if (latestIterationFingerprint && latestIterationFingerprint === uploadFingerprint) {
      const duplicateMessage = "检测到重复上传：当前迭代已存在相同文档内容，请仅上传增量文档。";
      setUploadToastMessage(duplicateMessage);
      setError(null);
      setUploadAnalysisProgress(null);
      return;
    }
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
      uploadFingerprint,
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
      setUploadToastMessage(null);
      setIsAnalyzingAttachment(true);
      setUploadAnalysisProgress({
        stage: "preparing",
        label: "正在准备上传内容",
        detail: "正在读取文件并构建分析上下文...",
        percent: 5
      });
      try {
        const uploadLabel =
          hasDocumentAssets && !hasPrototypeAssets
            ? "文档"
            : hasPrototypeAssets && !hasDocumentAssets
              ? "原型"
              : "附件";
        await createMessage(
          currentIteration.id,
          "system",
          isBatch ? `已上传${uploadLabel}：${folderName}（${files.length} 个文件）` : `已上传${uploadLabel}：${files[0].name}`
        );
      } catch {
        // ignore upload event message failure
      }
      if (hasPrototypeAssets && !hasDocumentAssets) {
        setLastUploadFailed(false);
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
      setLastUploadFailed(false);
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
      const clarificationQueue = (report.clarificationQuestions || []).map((item) => item.trim()).filter(Boolean);
      if (clarificationQueue.length === 0) {
        const qualityClarifications = [
          ...(report.reportQuality?.missingItems || []).map((item) => `请补充并确认：${item}`),
          ...(report.reportQuality?.actionRequired || []).map((item) => `请确认是否执行：${item}`)
        ]
          .map((item) => item.trim())
          .filter(Boolean);
        clarificationQueue.push(...qualityClarifications.slice(0, 3));
      }
      if (clarificationQueue.length > 0) {
        const firstQuestion = clarificationQueue[0];
        await createMessage(
          currentIteration.id,
          "assistant",
          `我先发起澄清：${firstQuestion}。请直接在 IM 对话中回复，我会像数字员工一样结合你的反馈持续追问、归纳并收敛边界与功能范围；当你认为理解一致时，回复“确认分析”即可完成最终确认。`
        );
      }
      await loadGovernance();
    } catch (err) {
      setLastUploadFailed(true);
      const message = resolveUploadErrorMessage(err);
      if (message.includes("重复上传")) {
        setUploadToastMessage(message);
      }
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

  const handleRetryUpload = async () => {
    if (!currentIteration) {
      return;
    }
    try {
      setUploadToastMessage(null);
      setError(null);
      setLastUploadFailed(false);
      setIsAnalyzingAttachment(true);
      setUploadAnalysisProgress({
        stage: "preparing",
        label: "正在重试分析",
        detail: "正在重新提交上一次失败任务...",
        percent: 5
      });
      const report = await retryIterationAttachmentAnalysis(currentIteration.id, {
        onJobUpdate: (job) => setUploadAnalysisProgress(toUploadProgress(job))
      });
      setAnalysisReport(report);
      setLastUploadFailed(false);
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
        "附件重试分析已完成，点击“查看分析报告”查看项目识别、产品识别与关键发现。"
      );
      await loadGovernance();
    } catch (err) {
      setLastUploadFailed(true);
      const message = resolveUploadErrorMessage(err);
      if (message.includes("重复上传")) {
        setUploadToastMessage(message);
      }
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
    setChatSendStatus("sending");
    setChatInput("");
    let userMessagePersisted = false;
    try {
      await createMessage(currentIteration.id, "user", text);
      userMessagePersisted = true;
      setChatSendStatus("sent");
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
          await createMessage(currentIteration.id, "assistant", `补充建议：${visualEditResult.warnings.join("；")}`);
        }
        return visualEditResult;
      }
      const resolvedQuestions = currentIteration.changeControl?.clarificationDraftResolvedQuestions ?? [];
      const coach = await coachIterationMessage(currentIteration.id, text);
      await createMessage(currentIteration.id, "assistant", coach.reply);
      if (coach.execution?.action === "rewrite") {
        const instruction = (coach.execution.instruction || text).trim();
        if (!instruction) {
          await createMessage(currentIteration.id, "assistant", "请补充具体改写目标（例如：更新 KPI 卡片标题与数据源）。");
          return null;
        }
        const rewrite = await rewriteIterationCode(currentIteration.id, {
          instruction,
          dryRun: coach.execution.apply === false,
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
      if (coach.execution?.action === "confirm-inaccurate") {
        await confirmIterationAnalysis(currentIteration.id, {
          accurate: false,
          note: text,
          actor: currentRole,
          resolvedClarificationQuestions: resolvedQuestions
        });
        await createMessage(
          currentIteration.id,
          "assistant",
          "已记录为“理解存在偏差”。我会继续收敛关键分歧，请补充你预期的范围、边界和验收结果。"
        );
        await loadIterationDetail(currentIteration.id);
        if (currentProjectId) {
          await loadIterations(currentProjectId);
        }
        await loadGovernance();
        return null;
      }
      if (coach.execution?.action === "confirm-accurate") {
        if (analysisReport?.reportQuality && !analysisReport.reportQuality.publishable) {
          await createMessage(
            currentIteration.id,
            "assistant",
            `当前分析报告未达到发布门禁（${analysisReport.reportQuality.score}分）：${analysisReport.reportQuality.summary || "请先补齐缺失项后再确认。"}`
          );
          return null;
        }
        await confirmIterationAnalysis(currentIteration.id, {
          accurate: true,
          note: text,
          actor: currentRole,
          resolvedClarificationQuestions: resolvedQuestions
        });
        await createMessage(currentIteration.id, "assistant", "已完成分析确认。后续可继续推进任务拆解、测试与发布动作。");
        await loadIterationDetail(currentIteration.id);
        if (currentProjectId) {
          await loadIterations(currentProjectId);
        }
        await loadGovernance();
        return null;
      }
      if (coach.execution?.action === "enter-clarify-mode") {
        await createMessage(currentIteration.id, "assistant", "已切换为澄清推进模式，接下来我会优先收敛关键待确认项。");
      }
      if (coach.execution?.action === "run-full-cycle" || coach.intent === "full-cycle") {
        const autoAnalysisInput = buildAutoFullCycleAnalysisInput();
        const fullCycle = await runIterationFullCycle(currentIteration.id, {
          analysisInput: autoAnalysisInput,
          runAnalysis: Boolean(autoAnalysisInput),
          autoConfirmAnalysis: true,
          autoResolveClarifications: true,
          rewriteInstruction: text.trim() || undefined,
          rewriteDryRun: false,
          generateTestArtifacts: true,
          testArtifactsDryRun: false,
          refreshReleaseReview: true,
          generateDeliveryPackage: true,
          deliveryPackageDryRun: false,
          publish: { enabled: true, dryRun: false }
        });
        const reviewReportFiles = fullCycle.deliveryPackageResult?.reviewReportFiles || [];
        const deliveryPackageFiles = fullCycle.deliveryPackageResult?.packageFiles || [];
        const frontendLane = fullCycle.steps?.frontendRewrite;
        const backendLane = fullCycle.steps?.backendRewrite;
        await createMessage(
          currentIteration.id,
          "assistant",
          `全量闭环执行完成：status=${fullCycle.status}。阻断=${fullCycle.blockers.length}，告警=${fullCycle.warnings.length}。\n` +
            `前端泳道：${frontendLane?.status || "-"}（${frontendLane?.note || "无"}）\n` +
            `后端泳道：${backendLane?.status || "-"}（${backendLane?.note || "无"}）\n` +
            `发布评审报告：${reviewReportFiles.join("；") || "未生成"}\n` +
            `可部署交付包：${deliveryPackageFiles.join("；") || "未生成"}`
        );
      }
      const followup = buildCoachFollowupMessage(coach);
      if (followup) {
        await createMessage(currentIteration.id, "assistant", followup);
      }
      await loadIterationDetail(currentIteration.id);
      return null;
    } catch (err) {
      const message = resolveCoachErrorMessage(err);
      setError(userMessagePersisted ? `消息已发送，但后续处理失败：${message}` : message);
      if (!userMessagePersisted) {
        setChatSendStatus("failed");
      }
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
    decisionEvent?: "understanding-accurate" | "understanding-inaccurate";
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
      if (payload.decisionEvent === "understanding-accurate") {
        await createMessage(
          currentIteration.id,
          "system",
          `分析理解确认：理解准确。${payload.note?.trim() ? `备注：${payload.note.trim()}` : ""}`
        );
      } else if (payload.decisionEvent === "understanding-inaccurate") {
        await createMessage(
          currentIteration.id,
          "system",
          `分析理解确认：理解不准确，已进入澄清流程。${payload.note?.trim() ? `备注：${payload.note.trim()}` : ""}`
        );
      }
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

  const handleGenerateTestArtifacts = async () => {
    if (!currentIteration) {
      return;
    }
    try {
      setBusy(true);
      const result = await generateIterationTestArtifacts(currentIteration.id);
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

  const handleSaveArtifactDraft = async (artifactId: string, payload: { content: string; media?: string[]; actor?: string }) => {
    if (!currentIteration) return;
    try {
      setBusy(true);
      await saveIterationArtifactDraft(currentIteration.id, artifactId, payload);
      await loadIterationDetail(currentIteration.id);
      if (currentProjectId) {
        await loadIterations(currentProjectId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleCommitArtifact = async (
    artifactId: string,
    payload: { actor?: string; summary?: string; evidence?: string[]; source?: string }
  ) => {
    if (!currentIteration) return;
    try {
      setBusy(true);
      await commitIterationArtifact(currentIteration.id, artifactId, payload);
      await loadIterationDetail(currentIteration.id);
      if (currentProjectId) {
        await loadIterations(currentProjectId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmArtifact = async (artifactId: string, payload: { actor?: string; passed?: boolean; note?: string }) => {
    if (!currentIteration) return;
    try {
      setBusy(true);
      await confirmIterationArtifact(currentIteration.id, artifactId, payload);
      await loadIterationDetail(currentIteration.id);
      if (currentProjectId) {
        await loadIterations(currentProjectId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleAppendArtifactToChat = async (artifactId: string, payload?: { actor?: string; prompt?: string }) => {
    if (!currentIteration) return;
    try {
      setBusy(true);
      const result = await appendIterationArtifactToChat(currentIteration.id, artifactId, payload);
      setChatMessages((prev) => [...prev, result.message]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      throw err;
    } finally {
      setBusy(false);
    }
  };

  const handleTransitionArtifactStage = async (
    payload: { toStage: "clarification" | "scope" | "interaction" | "development" | "testing" | "release" | "archive"; actor?: string; note?: string }
  ) => {
    if (!currentIteration) return;
    try {
      setBusy(true);
      await transitionIterationArtifactStage(currentIteration.id, payload);
      await loadIterationDetail(currentIteration.id);
      await fetchIterationArtifactWorkflow(currentIteration.id);
      if (currentProjectId) {
        await loadIterations(currentProjectId);
      }
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
    handleRetryUpload,
    lastUploadFailed,
    handleSend,
    handleRecomputeAssessment,
    handleRestoreSnapshot,
    handleTransitionState,
    handleUpdateClarificationDraft,
    handleConfirmIterationAnalysis,
    handleUpdateIterationBoundary,
    handleUpdateTestMatrixExecution,
    handleGenerateTestArtifacts,
    handleRefreshReleaseReview,
    handleSaveArtifactDraft,
    handleCommitArtifact,
    handleConfirmArtifact,
    handleAppendArtifactToChat,
    handleTransitionArtifactStage
  };
}
