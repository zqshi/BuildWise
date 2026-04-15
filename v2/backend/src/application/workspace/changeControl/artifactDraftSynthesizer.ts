/**
 * artifactDraftSynthesizer — 交付物内容质量检测
 *
 * 所有交付物内容由 LLM 驱动生成（见 analysis/artifactSynthesisAgentOps.ts），
 * 本文件仅保留内容质量检测工具函数。
 */

/**
 * 检测合成内容是否有实质业务信息（而非纯占位符/格式壳）。
 * 返回 true 表示内容有效，可以 commit。
 *
 * 检测策略：
 * 1. 去掉 markdown 格式符后，纯文本长度 >= 80 字符
 * 2. 不是纯数字/单字符条目堆砌
 * 3. 无高重复率（同一短文本出现 > 3 次）
 * 4. 占位短语比例不超过 30%
 * 5. markdown 列表项不是纯数字
 */
export function isSubstantiveContent(draft: string): boolean {
  if (!draft || draft.trim().length < 100) return false;

  // 去掉 markdown 格式符（标题、列表、引用、分隔线、加粗斜体）
  const plain = draft
    .replace(/^#{1,6}\s+.*$/gm, "")     // 标题行
    .replace(/^[-*+]\s+/gm, "")          // 列表前缀
    .replace(/^>\s+/gm, "")              // 引用前缀
    .replace(/^---+$/gm, "")             // 分隔线
    .replace(/[*_`~]/g, "")              // 行内格式
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // 链接
    .replace(/\s+/g, " ")
    .trim();

  // 纯文本去格式后太短
  if (plain.length < 60) return false;

  // 检查是否为纯数字/单字符条目堆砌（如 "1 1 1" 或 "a b c"）
  const tokens = plain.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const shortTokens = tokens.filter((t) => t.length <= 2);
  if (shortTokens.length / tokens.length > 0.7) return false;

  // 检查高重复率：最频繁的 token 占比 > 50%（排除常见虚词）
  const STOP_WORDS = new Set(["的", "了", "在", "是", "和", "与", "或", "等", "中", "为", "对"]);
  const freq = new Map<string, number>();
  for (const t of tokens) {
    if (STOP_WORDS.has(t) || t.length <= 1) continue;
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  const maxFreq = Math.max(0, ...freq.values());
  const meaningfulTokens = tokens.filter((t) => !STOP_WORDS.has(t) && t.length > 1).length;
  if (meaningfulTokens > 0 && maxFreq / meaningfulTokens > 0.5) return false;

  // 检查占位短语比例：超过 30% 的非空行是占位/待补充类文本
  const PLACEHOLDER_PATTERN = /^(待补充|待确认|待澄清|待完成|待评|待生成|待关联|待记录|无$|暂无|尚未|等待)/;
  const contentLines = draft.split("\n").map((l) => l.replace(/^[\s#*\->]+/, "").trim()).filter(Boolean);
  if (contentLines.length > 0) {
    const placeholderCount = contentLines.filter((l) => PLACEHOLDER_PATTERN.test(l)).length;
    if (placeholderCount / contentLines.length > 0.3) return false;
  }

  // 检查 markdown 列表项是否为纯数字（如 "- 1" 或 "* 1"）
  const listItems = draft.match(/^[-*+]\s+(.+)$/gm);
  if (listItems && listItems.length >= 3) {
    const numericItems = listItems.filter((item) => /^[-*+]\s+\d{1,3}$/.test(item.trim()));
    if (numericItems.length / listItems.length > 0.5) return false;
  }

  return true;
}
