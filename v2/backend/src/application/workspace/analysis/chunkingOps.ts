/**
 * chunkingOps — 大文档分片规划
 *
 * 当 excerpt 超过单次 LLM prompt 预算时，按文件/章节/段落边界切分为 N 个分片，
 * 每片携带全局 digest，保证 LLM 在分析单片时仍能理解整体背景。
 *
 * 设计原则：
 * - 无最大分片数限制 — 文档多大就分多少片，全量覆盖
 * - 不降级、不截断 — 通过增加分片数保证全量分析
 * - 分片边界尊重语义单元（文件 > 章节 > 段落 > 硬切+重叠）
 */

type ChunkEntry = {
  index: number;
  total: number;
  text: string;
  fileRange: string;
  charRange: [number, number];
};

type ChunkPlan = {
  chunks: ChunkEntry[];
  totalChars: number;
  chunkCount: number;
  digest: string;
};

// ---------------------------------------------------------------------------
// 文件标记分割（folder 模式 "[file N] path" 格式）
// ---------------------------------------------------------------------------

const FILE_MARKER_RE = /^\[file \d+\]/m;

function splitByFileMarkers(text: string): string[] {
  const parts: string[] = [];
  const lines = text.split("\n");
  let current: string[] = [];
  for (const line of lines) {
    if (FILE_MARKER_RE.test(line) && current.length > 0) {
      parts.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) {
    parts.push(current.join("\n"));
  }
  return parts.filter((p) => p.trim().length > 0);
}

// ---------------------------------------------------------------------------
// 章节标记分割（Markdown # / ## / --- ）
// ---------------------------------------------------------------------------

const SECTION_MARKER_RE = /^(?:#{1,3}\s|---\s*$)/m;

function splitBySections(text: string): string[] {
  const parts: string[] = [];
  const lines = text.split("\n");
  let current: string[] = [];
  for (const line of lines) {
    if (SECTION_MARKER_RE.test(line) && current.length > 0) {
      parts.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) {
    parts.push(current.join("\n"));
  }
  return parts.filter((p) => p.trim().length > 0);
}

// ---------------------------------------------------------------------------
// 段落分割（双换行 \n\n）
// ---------------------------------------------------------------------------

function splitByParagraphs(text: string): string[] {
  return text.split(/\n\n+/).filter((p) => p.trim().length > 0);
}

// ---------------------------------------------------------------------------
// 将语义片段合并到不超过 budget 的 chunk 中
// ---------------------------------------------------------------------------

function packSegmentsIntoChunks(segments: string[], budget: number, overlap: number): string[] {
  if (segments.length === 0) return [];
  const chunks: string[] = [];
  let current = "";
  for (const seg of segments) {
    // 单个 segment 已超过 budget → 必须硬切
    if (seg.length > budget) {
      if (current.trim().length > 0) {
        chunks.push(current.trim());
        current = "";
      }
      for (const sub of hardSplitWithOverlap(seg, budget, overlap)) {
        chunks.push(sub);
      }
      continue;
    }
    const separator = current.length > 0 ? "\n\n" : "";
    if (current.length + separator.length + seg.length > budget) {
      if (current.trim().length > 0) {
        chunks.push(current.trim());
      }
      current = seg;
    } else {
      current = current + separator + seg;
    }
  }
  if (current.trim().length > 0) {
    chunks.push(current.trim());
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// 硬切 + 重叠区
// ---------------------------------------------------------------------------

function hardSplitWithOverlap(text: string, budget: number, overlap: number): string[] {
  const result: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    const end = Math.min(offset + budget, text.length);
    result.push(text.slice(offset, end));
    offset = end - overlap;
    if (offset >= text.length) break;
    // 防止 overlap ≥ budget 导致无限循环
    if (offset <= result.length * (budget - overlap) - budget) break;
  }
  return result;
}

// ---------------------------------------------------------------------------
// 公共 API
// ---------------------------------------------------------------------------

/**
 * 将 excerpt 按语义边界切分为分片。
 *
 * 优先级：文件边界 > 章节边界 > 段落边界 > 硬切+重叠
 *
 * @param text     原始 excerpt 全文
 * @param budget   每片最大字符数
 * @param overlap  硬切时的重叠字符数（默认 500）
 */
function splitExcerptByBoundary(text: string, budget: number, overlap = 500): string[] {
  if (text.length <= budget) {
    return [text];
  }
  // 尝试按文件标记切分
  const fileSegments = splitByFileMarkers(text);
  if (fileSegments.length > 1) {
    const packed = packSegmentsIntoChunks(fileSegments, budget, overlap);
    if (packed.length > 0) return packed;
  }
  // 尝试按章节切分
  const sectionSegments = splitBySections(text);
  if (sectionSegments.length > 1) {
    const packed = packSegmentsIntoChunks(sectionSegments, budget, overlap);
    if (packed.length > 0) return packed;
  }
  // 尝试按段落切分
  const paraSegments = splitByParagraphs(text);
  if (paraSegments.length > 1) {
    const packed = packSegmentsIntoChunks(paraSegments, budget, overlap);
    if (packed.length > 0) return packed;
  }
  // 最后手段：硬切 + 重叠
  return hardSplitWithOverlap(text, budget, overlap);
}

/**
 * 为 excerpt 生成完整的分片计划。
 *
 * @param text             原始 excerpt 全文
 * @param digest           整体文档结构摘要（传给每个分片作为全局上下文）
 * @param chunkBudget      每片最大字符数
 * @param overlapChars     硬切时重叠字符数（默认 500）
 */
export function planChunks(
  text: string,
  digest: string,
  chunkBudget: number,
  overlapChars = 500
): ChunkPlan {
  const rawChunks = splitExcerptByBoundary(text, chunkBudget, overlapChars);
  const total = rawChunks.length;
  let charOffset = 0;
  const chunks: ChunkEntry[] = rawChunks.map((chunkText, index) => {
    const start = charOffset;
    const end = start + chunkText.length;
    charOffset = end;
    return {
      index,
      total,
      text: chunkText,
      fileRange: `片段 ${index + 1} / 共 ${total} 个`,
      charRange: [start, end]
    };
  });
  return {
    chunks,
    totalChars: text.length,
    chunkCount: total,
    digest
  };
}

/**
 * 将数组分成固定大小的批次。
 */
export function batchArray<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
