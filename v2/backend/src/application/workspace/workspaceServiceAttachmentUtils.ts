import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import type {
  AttachmentUploadInput,
  IterationCodeRewriteResponse
} from "../../domain/workspace/types";
export { nowIso, pickStringList } from "../../shared/utils";
import { mergeAttachmentReports } from "./workspaceServiceAttachmentReportMerge";

function countInputFiles(input: AttachmentUploadInput) {
  if (input.sourceType === "folder" && Array.isArray(input.files) && input.files.length > 0) {
    return input.files.length;
  }
  return 1;
}

export function summarizeInput(input: AttachmentUploadInput) {
  const totalFiles = countInputFiles(input);
  const totalBytes =
    input.sourceType === "folder" && Array.isArray(input.files) && input.files.length > 0
      ? input.files.reduce((total, item) => total + (Number.isFinite(item.size) ? item.size : 0), 0)
      : Number.isFinite(input.size)
        ? input.size
        : 0;
  return {
    fileName: input.fileName,
    sourceType: input.sourceType === "folder" ? "folder" : "single-file",
    folderName: input.folderName?.trim() || "",
    totalFiles,
    totalBytes
  } as const;
}

function hashFingerprint(input: string) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildAttachmentInputFingerprint(input: AttachmentUploadInput) {
  const sourceType = input.sourceType === "folder" ? "folder" : "single-file";
  const fileName = (input.fileName || "").trim();
  const folderName = (input.folderName || "").trim();
  const size = Number.isFinite(input.size) ? Number(input.size) : 0;
  const mimeType = (input.mimeType || "").trim().toLowerCase();
  const digest = (input.excerptDigest || "").trim();
  const excerptHead = (input.excerpt || "").trim().slice(0, 400);
  const files =
    sourceType === "folder" && Array.isArray(input.files)
      ? input.files
          .map((item) => ({
            path: (item.path || item.fileName || "").trim(),
            fileName: (item.fileName || "").trim(),
            size: Number.isFinite(item.size) ? Number(item.size) : 0,
            mimeType: (item.mimeType || "").trim().toLowerCase()
          }))
          .filter((item) => item.path || item.fileName)
          .sort((a, b) => `${a.path}|${a.fileName}`.localeCompare(`${b.path}|${b.fileName}`))
      : [];
  const raw = JSON.stringify({
    sourceType,
    fileName,
    folderName,
    size,
    mimeType,
    digest,
    excerptHead,
    files
  });
  return `afp-${hashFingerprint(raw)}`;
}

export function parseAttachmentInputSnapshot(raw: string): AttachmentUploadInput | null {
  const text = (raw || "").trim();
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as AttachmentUploadInput;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    if (typeof parsed.fileName !== "string" || !parsed.fileName.trim()) {
      return null;
    }
    if (parsed.sourceType !== "single-file" && parsed.sourceType !== "folder") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function shortId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

export function ensureDir(path: string) {
  mkdirSync(path, { recursive: true });
}

export function sha256Hex(buffer: Uint8Array | string) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function splitAttachmentInputIntoBatches(input: AttachmentUploadInput, maxBatchFiles: number) {
  if (input.sourceType !== "folder" || !Array.isArray(input.files) || input.files.length <= maxBatchFiles) {
    return [input];
  }
  const files = input.files;
  const batches: AttachmentUploadInput[] = [];
  const totalBatches = Math.ceil(files.length / maxBatchFiles);
  for (let index = 0; index < totalBatches; index += 1) {
    const batchFiles = files.slice(index * maxBatchFiles, (index + 1) * maxBatchFiles);
    const digestBase = (input.excerptDigest || "").trim();
    const digest = digestBase
      ? `${digestBase};batch=${index + 1}/${totalBatches};batchFiles=${batchFiles.length}`
      : `strategy=folder-batch;batch=${index + 1}/${totalBatches};batchFiles=${batchFiles.length}`;
    const batchPreview = batchFiles
      .filter((item) => item.excerpt.trim().length > 0)
      .slice(0, 3)
      .map((item) => `${item.path || item.fileName}: ${item.excerpt.slice(0, 180)}`)
      .join("\n\n");
    batches.push({
      ...input,
      excerpt: (batchPreview || input.excerpt || "").slice(0, 6000),
      excerptDigest: digest,
      excerptStrategy: "folder-batch",
      files: batchFiles
    });
  }
  return batches;
}

function createEmptyRewriteResponse(iterationId: number, dryRun: boolean, summary: string): IterationCodeRewriteResponse {
  return {
    iterationId,
    dryRun,
    summary,
    warnings: [],
    appliedFiles: [],
    skippedFiles: [],
    outOfBoundaryFiles: [],
    edits: []
  };
}

export function mergeRewriteResults(
  iterationId: number,
  dryRun: boolean,
  runs: Array<{ label: string; result: IterationCodeRewriteResponse | null }>
): IterationCodeRewriteResponse {
  const validRuns = runs
    .filter((item) => Boolean(item.result))
    .map((item) => ({ label: item.label, result: item.result as IterationCodeRewriteResponse }));
  if (validRuns.length === 0) {
    return createEmptyRewriteResponse(iterationId, dryRun, "未执行改写：未获得有效改写结果。");
  }
  const summary = validRuns.map((item) => `${item.label}:${item.result.summary}`).join(" | ");
  return {
    iterationId,
    dryRun,
    summary,
    warnings: Array.from(new Set(validRuns.flatMap((item) => item.result.warnings))),
    appliedFiles: Array.from(new Set(validRuns.flatMap((item) => item.result.appliedFiles))),
    skippedFiles: Array.from(new Set(validRuns.flatMap((item) => item.result.skippedFiles))),
    outOfBoundaryFiles: Array.from(new Set(validRuns.flatMap((item) => item.result.outOfBoundaryFiles))),
    edits: validRuns.flatMap((item) => item.result.edits)
  };
}

// LLM（如 DeepSeek）常返回中文 key，此映射表将中文 key 归一化为英文
const CN_TO_EN_KEY_MAP: Record<string, string> = {
  "项目名称": "projectName", "产品名称": "productName", "项目类别": "projectCategory", "项目类型": "projectCategory",
  "依据": "evidence", "证据": "evidence",
  "关键发现": "meaningfulFindings", "关键线索": "meaningfulFindings", "核心发现": "meaningfulFindings",
  "优先级发现": "prioritizedFindings", "优先发现": "prioritizedFindings",
  "下一步动作": "nextActions", "下一步": "nextActions", "后续动作": "nextActions",
  "优先级": "priority", "发现": "content", "内容": "content", "原因": "reason", "理由": "reason",
  "项目检测": "projectDetection", "项目识别": "projectDetection",
  "核心意图": "coreIntent", "成功标准": "successCriteria", "交互洞察": "interactionInsights",
  "主要流程": "primaryFlow", "关键交互": "keyInteractions", "异常路径": "exceptionPaths", "可用性风险": "usabilityRisks",
  "必要性评估": "necessityAssessment", "必须做": "mustDo", "应该做": "shouldDo", "可延期": "canDefer", "范围外": "outOfScope",
  "理由说明": "rationale", "证据引用": "evidenceRefs", "边界摘要": "boundarySummary",
  "功能点": "functionalPoints", "确认清单": "confirmationChecklist",
  "版本差异摘要": "versionDiffSummary", "差异描述": "diffNarratives", "差异确认顺序": "diffConfirmationOrder",
  "影响等级": "impactLevel", "条目": "item", "顺序": "order",
  "覆盖": "coverage", "文件洞察": "fileInsights", "跨文件洞察": "crossFileInsights",
  "已考虑文件": "consideredFiles", "已分析文件": "analyzedFiles", "部分文件": "partialFiles", "失败文件": "failedFiles", "覆盖率": "coveragePercent",
  "路径": "path", "文件名": "fileName", "类型": "mimeType", "大小": "size", "种类": "kind", "状态": "status",
  "主要内容": "mainContent", "所需工作": "requiredWork", "迭代价值": "iterationValue", "摘要": "summary",
  "关键点": "keyPoints", "风险": "risks", "优化项": "optimizeItems", "保留项": "keepItems",
  "建议动作": "recommendedActions", "待解决问题": "openQuestions", "引用": "citations", "置信度": "confidence",
  "主题": "themes", "冲突": "conflicts", "缺口": "gaps", "建议": "recommendations",
  "冲突链": "conflictChains", "根因": "rootCauses", "影响范围": "impactScope", "决策建议": "decisionSuggestions",
  "降级": "degraded", "强制单Agent": "enforceSingleAgent", "强制多Agent": "forceMultiAgent", "预算风险": "promptBudgetRisk",
  "包含路径": "includedPaths", "忽略文件": "ignoredFiles", "采样理由": "sampleReason",
  "产品类别": "projectCategory", "制品类型": "artifactType", "关键特征": "keyCharacteristics",
  "版本变更摘要": "versionChangeSummary", "限制": "limitations",
  "报告质量": "reportQuality", "质量评分": "score", "质量摘要": "qualitySummary",
  "测试矩阵": "testMatrix", "边界": "boundary", "假设": "hypotheses", "分诊步骤": "triageSteps", "回滚决策": "rollbackDecision"
};

function normalizeKeysDeep(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(normalizeKeysDeep);
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const normalizedKey = CN_TO_EN_KEY_MAP[key] || key;
      result[normalizedKey] = normalizeKeysDeep(value);
    }
    return result;
  }
  return obj;
}

export function safeJsonParse(value: string) {
  const text = value.trim();
  if (!text) {
    return null;
  }
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        // fall through to truncated JSON repair
      }
    }
    if (!parsed) {
      parsed = tryRepairTruncatedJson(text);
    }
  }
  if (parsed) {
    return normalizeKeysDeep(parsed) as Record<string, unknown>;
  }
  return null;
}

/**
 * Attempt to extract `reply` field from truncated JSON output.
 * When LLM output is cut off mid-JSON, the closing braces are missing,
 * but we can still extract the reply value via regex.
 */
function tryRepairTruncatedJson(text: string): Record<string, unknown> | null {
  const replyMatch = text.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/s);
  if (!replyMatch) {
    return null;
  }
  let reply = replyMatch[1];
  try {
    reply = JSON.parse(`"${reply}"`);
  } catch {
    reply = reply.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (!reply || reply.length < 10) {
    return null;
  }
  const intentMatch = text.match(/"intent"\s*:\s*"([^"]+)"/);
  return {
    reply,
    intent: intentMatch?.[1] || "general",
    _repaired: true
  };
}

export { mergeAttachmentReports };
