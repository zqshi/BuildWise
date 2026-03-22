/**
 * SkillInjector — 将选中的 Skill SOP 内容注入到 Coach prompt
 *
 * 负责格式化、截断、限制总量，确保 prompt 不超出 context window。
 */

import type { UnifiedSkillEntry } from "./skillRegistry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SkillInjectionOptions = {
  maxTotalChars?: number;
  maxSkills?: number;
};

const DEFAULT_MAX_TOTAL_CHARS = 8000;
const DEFAULT_MAX_SKILLS = 3;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildSkillPromptInjection(
  selectedSkills: UnifiedSkillEntry[],
  options: SkillInjectionOptions
): string {
  if (selectedSkills.length === 0) return "";

  const maxSkills = options.maxSkills ?? DEFAULT_MAX_SKILLS;
  const maxTotalChars = options.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;

  const skills = selectedSkills.slice(0, maxSkills);
  const perSkillBudget = Math.floor(maxTotalChars / skills.length);

  const blocks: string[] = [];
  let totalChars = 0;

  for (const skill of skills) {
    const header = `[SKILL: ${skill.id}] ${skill.name}`;
    const headerLine = `\n${header}\n`;

    let sopText = skill.sopContent || "";
    const available = Math.max(0, perSkillBudget - headerLine.length);
    if (sopText.length > available) {
      sopText = sopText.slice(0, available - 3) + "...";
    }

    const block = headerLine + sopText;
    if (totalChars + block.length > maxTotalChars && blocks.length > 0) {
      break;
    }
    blocks.push(block);
    totalChars += block.length;
  }

  return blocks.join("\n");
}
