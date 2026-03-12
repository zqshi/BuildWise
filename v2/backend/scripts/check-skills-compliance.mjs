import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SKILLS_ROOT = path.resolve(ROOT, "skills");
const BUILDWISE_CHAIN_ROOT = path.resolve(SKILLS_ROOT, "buildwise-openclaw");
const ALLOWED_FRONTMATTER_KEYS = new Set(["name", "description", "license", "allowed-tools", "metadata"]);

function listSkillFiles(dir) {
  const files = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !existsSync(current)) continue;
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.name === "SKILL.md" || entry.name.endsWith(".SKILL.md")) {
        files.push(full);
      }
    }
  }
  return files.sort();
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const lines = match[1].split(/\r?\n/);
  const keys = [];
  const values = {};
  for (const line of lines) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const raw = kv[2].trim();
    keys.push(key);
    values[key] = raw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
  return { keys, values };
}

function readJSON(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

const failures = [];
const reports = [];

if (!existsSync(SKILLS_ROOT)) {
  failures.push("missing skills root: v2/backend/skills");
} else {
  const files = listSkillFiles(SKILLS_ROOT);
  if (files.length === 0) {
    failures.push("no skill files found");
  }

  for (const file of files) {
    const rel = path.relative(ROOT, file);
    const raw = readFileSync(file, "utf-8");
    const frontmatter = parseFrontmatter(raw);
    if (!frontmatter) {
      failures.push(`missing frontmatter: ${rel}`);
      continue;
    }
    const unexpected = frontmatter.keys.filter((key) => !ALLOWED_FRONTMATTER_KEYS.has(key));
    if (unexpected.length > 0) {
      failures.push(`unexpected frontmatter keys in ${rel}: ${unexpected.join(", ")}`);
    }
    const name = String(frontmatter.values.name || "").trim();
    const description = String(frontmatter.values.description || "").trim();
    if (!name) failures.push(`missing name in ${rel}`);
    if (!description) failures.push(`missing description in ${rel}`);

    reports.push({ file: rel, name, hasDescription: description.length > 0 });
  }
}

const chainPath = path.resolve(BUILDWISE_CHAIN_ROOT, "skill-chain.json");
if (!existsSync(chainPath)) {
  failures.push("missing chain config: skills/buildwise-openclaw/skill-chain.json");
} else {
  const chain = readJSON(chainPath);
  const sequence = Array.isArray(chain.sequence) ? chain.sequence.map((item) => String(item).trim()).filter(Boolean) : [];
  if (sequence.length === 0) {
    failures.push("buildwise-openclaw skill sequence is empty");
  }
  for (const skillId of sequence) {
    const skillDir = path.resolve(BUILDWISE_CHAIN_ROOT, skillId);
    const skillFile = path.resolve(skillDir, "SKILL.md");
    const openaiYaml = path.resolve(skillDir, "agents", "openai.yaml");
    if (!existsSync(skillFile)) {
      failures.push(`missing chain skill file: ${path.relative(ROOT, skillFile)}`);
      continue;
    }
    if (!existsSync(openaiYaml)) {
      failures.push(`missing openai.yaml: ${path.relative(ROOT, openaiYaml)}`);
      continue;
    }

    const skillText = readFileSync(skillFile, "utf-8");
    for (const heading of ["## Goal", "## Inputs", "## Outputs", "## SOP"]) {
      if (!skillText.includes(heading)) {
        failures.push(`missing ${heading} in ${path.relative(ROOT, skillFile)}`);
      }
    }

    const yamlText = readFileSync(openaiYaml, "utf-8");
    for (const key of ["display_name:", "short_description:", "default_prompt:"]) {
      if (!yamlText.includes(key)) {
        failures.push(`missing ${key} in ${path.relative(ROOT, openaiYaml)}`);
      }
    }
    if (!yamlText.includes(`$${skillId}`)) {
      failures.push(`default_prompt must reference $${skillId}: ${path.relative(ROOT, openaiYaml)}`);
    }
  }
}

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      skillsRoot: SKILLS_ROOT,
      reportsCount: reports.length,
      failures
    },
    null,
    2
  )
);

if (failures.length > 0) {
  process.exit(1);
}
