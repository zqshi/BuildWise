/**
 * SkillRegistry — 统一 Skill 注册表
 *
 * 将三套 Skill 数据源合一：
 * 1. 文件 Pack（skills/ 目录下的 SKILL.md）
 * 2. Global 自定义（openclaw-global.json 中的 skills 记录）
 * 3. Policy skillsPlan（项目策略中的技能计划）
 *
 * 优先级：global-custom > file-pack（同 ID 覆盖）
 * Policy skillsPlan 作为过滤器：当指定时只保留计划中的 skill
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FilePackSkillEntry = {
  id: string;
  name: string;
  description: string;
  sopContent: string;
};

export type GlobalCustomSkillEntry = {
  id: string;
  name: string;
  description: string;
  content: string;
  status: string;
};

export type SkillsPlanEntry = {
  stage: string;
  skills: string[];
};

export type UnifiedSkillEntry = {
  id: string;
  name: string;
  description: string;
  sopContent: string;
  source: "file-pack" | "global-custom";
};

// ---------------------------------------------------------------------------
// File Pack Loader (with full SOP content)
// ---------------------------------------------------------------------------

function parseFrontmatterValue(source: string, key: string): string {
  const matched = source.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return matched?.[1]?.trim().replace(/^["']|["']$/g, "") || "";
}

function extractSopContent(markdown: string): string {
  // 跳过 frontmatter（--- ... ---）后的正文即为 SOP 内容
  const fmEnd = markdown.indexOf("---", markdown.indexOf("---") + 3);
  if (fmEnd < 0) return markdown;
  return markdown.slice(fmEnd + 3).trim();
}

export function loadFilePackSkillsWithSop(
  skillsDir?: string
): FilePackSkillEntry[] {
  const baseDir = skillsDir || resolve(process.cwd(), "skills", "buildwise-openclaw");
  const chainPath = resolve(baseDir, "skill-chain.json");
  if (!existsSync(chainPath)) return [];

  let sequence: string[];
  try {
    const parsed = JSON.parse(readFileSync(chainPath, "utf-8"));
    if (!Array.isArray(parsed.sequence)) return [];
    sequence = parsed.sequence
      .map((item: unknown) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean)
      .slice(0, 16);
  } catch {
    return [];
  }

  return sequence
    .map((id) => {
      const skillPath = resolve(baseDir, id, "SKILL.md");
      if (!existsSync(skillPath)) return null;
      try {
        const content = readFileSync(skillPath, "utf-8");
        return {
          id,
          name: parseFrontmatterValue(content, "name") || id,
          description: parseFrontmatterValue(content, "description"),
          sopContent: extractSopContent(content),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean) as FilePackSkillEntry[];
}

// ---------------------------------------------------------------------------
// Unified Registry Builder
// ---------------------------------------------------------------------------

export function buildUnifiedSkillRegistryOp(
  filePackSkills: FilePackSkillEntry[],
  globalCustomSkills: GlobalCustomSkillEntry[],
  policySkillsPlan: SkillsPlanEntry[]
): UnifiedSkillEntry[] {
  const registry = new Map<string, UnifiedSkillEntry>();

  // 1. File pack skills (lowest priority)
  for (const skill of filePackSkills) {
    registry.set(skill.id, {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      sopContent: skill.sopContent,
      source: "file-pack",
    });
  }

  // 2. Global custom skills (higher priority, override file-pack)
  for (const skill of globalCustomSkills) {
    if (skill.status !== "active") continue;
    registry.set(skill.id, {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      sopContent: skill.content,
      source: "global-custom",
    });
  }

  // 3. Policy skillsPlan as filter
  if (policySkillsPlan.length > 0) {
    const allowedIds = new Set<string>();
    for (const plan of policySkillsPlan) {
      for (const skillId of plan.skills) {
        allowedIds.add(skillId);
      }
    }
    const filtered: UnifiedSkillEntry[] = [];
    for (const [id, entry] of registry) {
      if (allowedIds.has(id)) {
        filtered.push(entry);
      }
    }
    return filtered;
  }

  return Array.from(registry.values());
}
