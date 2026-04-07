import type { AttachmentUploadInput, VisionPayload } from "../../domain/workspace/types";

export type FolderSelectionDecision = {
  includedPaths: string[];
  ignoredFiles: Array<{ path: string; reason: string }>;
  sampleReason: string;
};

export type AttachmentExcerptGuardrails = {
  maxFolderFiles: number;
  maxFolderManifestFiles: number;
  maxFolderExcerptFiles: number;
};

export type AttachmentExcerptPayload = {
  text: string;
  digest: string;
  strategy: string;
  fileStats: {
    totalFiles: number;
    textFiles: number;
    binaryFiles: number;
  };
  fileSelection: {
    consideredFiles: number;
    includedFiles: number;
    skippedNoiseFiles: number;
    skippedEmptyFiles: number;
    sampled: boolean;
    sampleReason: string;
    includedPaths: string[];
    ignoredFiles: Array<{ path: string; reason: string }>;
  };
  batchContexts: string[];
};

export function composeAttachmentExcerpt(
  input: AttachmentUploadInput,
  guardrails: AttachmentExcerptGuardrails,
  folderSelection?: FolderSelectionDecision | null
): AttachmentExcerptPayload {
  const inlineVisionPayloads = Array.isArray(input.visionPayloads)
    ? input.visionPayloads
        .map((item) => ({
          path: (item.path || "").trim(),
          mimeType: (item.mimeType || "").trim(),
          dataUrl: (item.dataUrl || "").trim()
        }))
        .filter((item) => item.dataUrl.startsWith("data:image/"))
        .slice(0, 2)
    : [];
  const rawFiles = Array.isArray(input.files)
    ? input.files
        .map((item) => ({
          path: (item.path || item.fileName || "").trim(),
          fileName: (item.fileName || "").trim(),
          mimeType: (item.mimeType || "application/octet-stream").trim(),
          size: Number.isFinite(item.size) ? item.size : 0,
          excerpt: (item.excerpt || "").trim()
        }))
        .filter((item) => item.fileName.length > 0)
    : [];
  if (rawFiles.length > 0 || input.sourceType === "folder") {
    const consideredFiles = rawFiles.length;
    const ignoredFiles: Array<{ path: string; reason: string }> = Array.isArray(folderSelection?.ignoredFiles)
      ? folderSelection.ignoredFiles.slice(0, 40)
      : [];
    const selectedPathSet = new Set((folderSelection?.includedPaths || []).map((item) => item.trim()).filter(Boolean));
    const selectedFiles = selectedPathSet.size > 0 ? rawFiles.filter((item) => selectedPathSet.has(item.path || item.fileName)) : rawFiles;
    const limitedFiles = selectedFiles.slice(0, guardrails.maxFolderFiles);
    const sampled = selectedFiles.length > limitedFiles.length || selectedFiles.length < rawFiles.length;
    const sampleReason = (folderSelection?.sampleReason || "").trim() || (sampled ? "llm-file-selection" : "");
    const skippedNoiseFiles = ignoredFiles.filter((item) => item.reason.toLowerCase().includes("noise")).length;
    const skippedEmptyFiles = ignoredFiles.filter((item) => item.reason.toLowerCase().includes("empty")).length;
    const textFiles = limitedFiles.filter((item) => item.excerpt.length > 0).length;
    const binaryFiles = Math.max(limitedFiles.length - textFiles, 0);
    const manifest = limitedFiles
      .slice(0, guardrails.maxFolderManifestFiles)
      .map((item, index) => `[${index + 1}] ${item.path || item.fileName} (${item.mimeType}, ${item.size}B)`)
      .join("\n");
    const excerpts = limitedFiles
      .filter((item) => item.excerpt)
      .slice(0, guardrails.maxFolderExcerptFiles)
      .map((item, index) => {
        // 小文件（< 3000 字符）：全量传输
        // 大文件：传输更多内容（从 800 提升到 3000），保证充分分析
        const excerptLength = Math.min(item.excerpt.length, 3000);
        return `[file ${index + 1}] ${item.path || item.fileName}\n${item.excerpt.slice(0, excerptLength)}`;
      })
      .join("\n\n---\n\n");
    const folderLabel = (input.folderName || input.fileName || "folder").trim();
    const batchSize = 30;
    // 为实现全量分析，增加 batch 数量限制和每批文件数
    // 根据文件总数动态调整，确保所有文件都能被分析
    const maxBatches = Math.max(4, Math.ceil(limitedFiles.length / batchSize));
    const batchContexts = Array.from({ length: Math.ceil(limitedFiles.length / batchSize) }, (_, index) => {
      const batch = limitedFiles.slice(index * batchSize, index * batchSize + batchSize);
      const manifestPart = batch
        .map((item, i) => `[${index * batchSize + i + 1}] ${item.path || item.fileName} (${item.mimeType})`)
        .join("\n");
      // 移除文件数量限制，让所有文件的 excerpt 都包含在 batch 中
      // 每个文件的内容长度也增加到 3000 字符，保证充分分析
      const excerptPart = batch
        .filter((item) => item.excerpt)
        .map((item, i) => {
          const excerptLength = Math.min(item.excerpt.length, 3000);
          return `[${i + 1}] ${item.path || item.fileName}\n${item.excerpt.slice(0, excerptLength)}`;
        })
        .join("\n\n");
      return [`batch=${index + 1}`, `manifest:\n${manifestPart}`, excerptPart ? `excerpt:\n${excerptPart}` : ""].filter(Boolean).join("\n\n");
    }).slice(0, maxBatches);
    const text = [
      `folder=${folderLabel}`,
      `manifest:\n${manifest}`,
      excerpts ? `excerpt:\n${excerpts}` : "",
      inlineVisionPayloads.length > 0
        ? `vision:\n${inlineVisionPayloads.map((item, index) => `[image ${index + 1}] ${item.path || "attachment"} (${item.mimeType || "image"})`).join("\n")}`
        : ""
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 50000); // 从 14000 增加到 50000，支持更多文件内容
    return {
      text,
      digest:
        (input.excerptDigest || "").trim() ||
        `strategy=folder-batch;considered=${consideredFiles};included=${limitedFiles.length};textFiles=${textFiles};binaryFiles=${binaryFiles};noiseSkipped=${skippedNoiseFiles};emptySkipped=${skippedEmptyFiles};sampled=${sampled ? "yes" : "no"}`,
      strategy: "folder-batch",
      fileStats: {
        totalFiles: limitedFiles.length,
        textFiles,
        binaryFiles
      },
      fileSelection: {
        consideredFiles,
        includedFiles: limitedFiles.length,
        skippedNoiseFiles,
        skippedEmptyFiles,
        sampled,
        sampleReason,
        includedPaths: limitedFiles.map((item) => item.path || item.fileName).slice(0, 12),
        ignoredFiles: ignoredFiles.slice(0, 20)
      },
      batchContexts
    };
  }
  const baseExcerpt = (input.excerpt || "").trim();
  const chunks = Array.isArray(input.excerptChunks) ? input.excerptChunks.map((item) => item.trim()).filter(Boolean).slice(0, 20) : [];
  const digest = (input.excerptDigest || "").trim();
  const strategy = input.excerptStrategy || "direct";
  if (chunks.length === 0) {
    const baseText =
      baseExcerpt.slice(0, 20000) ||
      (inlineVisionPayloads.length > 0
        ? inlineVisionPayloads
            .map((item, index) => `[image ${index + 1}] ${item.path || input.fileName || "attachment"} (${item.mimeType || "image"})`)
            .join("\n")
        : "");
    return {
      text: baseText,
      digest: digest || `strategy=${strategy};chunks=0`,
      strategy,
      fileStats: {
        totalFiles: 1,
        textFiles: baseExcerpt.length > 0 ? 1 : 0,
        binaryFiles: baseExcerpt.length > 0 ? 0 : 1
      },
      fileSelection: {
        consideredFiles: 1,
        includedFiles: 1,
        skippedNoiseFiles: 0,
        skippedEmptyFiles: 0,
        sampled: false,
        sampleReason: "",
        includedPaths: [input.fileName || "attachment"],
        ignoredFiles: []
      },
      batchContexts: []
    };
  }
  const stitched = chunks.map((chunk, index) => `[chunk ${index + 1}/${chunks.length}]\n${chunk}`).join("\n\n---\n\n").slice(0, 50000);
  const combined = [
    baseExcerpt.slice(0, 10000),
    stitched,
    inlineVisionPayloads.length > 0
      ? inlineVisionPayloads
          .map((item, index) => `[image ${index + 1}] ${item.path || input.fileName || "attachment"} (${item.mimeType || "image"})`)
          .join("\n")
      : ""
  ]
    .filter(Boolean)
    .join("\n\n");
  return {
    text: combined.slice(0, 50000),
    digest: digest || `strategy=${strategy};chunks=${chunks.length}`,
    strategy,
    fileStats: {
      totalFiles: 1,
      textFiles: combined.length > 0 ? 1 : 0,
      binaryFiles: combined.length > 0 ? 0 : 1
    },
    fileSelection: {
      consideredFiles: 1,
      includedFiles: 1,
      skippedNoiseFiles: 0,
      skippedEmptyFiles: 0,
      sampled: false,
      sampleReason: "",
      includedPaths: [input.fileName || "attachment"],
      ignoredFiles: []
    },
    batchContexts: []
  };
}

export function resolveVisionPayloads(input: AttachmentUploadInput): VisionPayload[] {
  const fromTopLevel = Array.isArray(input.visionPayloads) ? input.visionPayloads : [];
  const fromFiles = Array.isArray(input.files)
    ? input.files
        .map((item) => ({
          path: item.path || item.fileName || input.fileName,
          mimeType: item.mimeType || "image/*",
          dataUrl: item.imageDataUrl || ""
        }))
        .filter((item) => item.dataUrl.trim().startsWith("data:image/"))
    : [];
  const merged = [...fromTopLevel, ...fromFiles]
    .map((item) => ({
      path: (item.path || "").trim().slice(0, 260),
      mimeType: (item.mimeType || "").trim().slice(0, 120),
      dataUrl: (item.dataUrl || "").trim()
    }))
    .filter((item) => item.dataUrl.startsWith("data:image/"))
    .slice(0, 2);
  return merged;
}
