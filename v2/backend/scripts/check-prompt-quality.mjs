import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const promptDir = resolve(root, "prompts");

const promptSpecs = [
  { file: "agent.iteration-coach.v2.md", requiredVars: ["message", "scope", "goal", "context", "expectedOutput"] },
  { file: "agent.orchestrator.v2.md", requiredVars: ["scope", "goal", "context", "expectedOutput"] },
  { file: "agent.requirements-analyst.v2.md", requiredVars: ["scope", "goal", "context", "expectedOutput"] },
  { file: "agent.task-planner.v2.md", requiredVars: ["scope", "goal", "context", "expectedOutput"] },
  { file: "agent.delivery-engineer.v2.md", requiredVars: ["scope", "goal", "context", "expectedOutput"] },
  { file: "agent.qa-reviewer.v2.md", requiredVars: ["scope", "goal", "context", "expectedOutput"] },
  { file: "agent.boundary-guardian.v2.md", requiredVars: ["scope", "goal", "context", "expectedOutput"] },
  { file: "agent.release-ops-advisor.v2.md", requiredVars: ["scope", "goal", "context", "expectedOutput"] }
];

function parseSections(content) {
  const lower = content.toLowerCase();
  const systemStart = lower.indexOf("# system");
  const userStart = lower.indexOf("# user");
  if (systemStart < 0 || userStart < 0 || userStart <= systemStart) {
    return null;
  }
  return {
    system: content.slice(systemStart + "# system".length, userStart).trim(),
    user: content.slice(userStart + "# user".length).trim()
  };
}

function render(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, key) => vars[key] ?? "");
}

// ── 动态 userPrompt schema 泄露检测 ──────────────────────────────────
// CLAUDE.md 第五节：禁止将内部 JSON 字段名直接拼入 userPrompt（schema 应通过
// expectedOutput 字段传递，userPrompt 用自然语言）。此函数扫描 application 层
// .ts 文件中 userPrompt 字面量赋值，检测 JSON schema 字段名泄露。

// 命中任一即视为 schema 泄露
const SCHEMA_LEAK_PATTERNS = [
  /\w+\s*\[\s*\]/,         // field[] 如 uxConstraints[]、warnings[]
  /JSON\s*[:：]\s*\{/,     // "请输出 JSON: {" 或 "JSON：{"
  /\{\s*\w+\s*:\s*\[/      // {field:[ 如 {actions:[
];

// 从 userPrompt: 之后的文本中提取字面量值（模板串/普通串/数组），返回值文本；
// 动态构造（函数调用/变量）返回 null（需 code review 把关）。
function extractUserPromptValue(rest) {
  const trimmedStart = rest.length - rest.trimStart().length;
  const firstChar = rest[trimmedStart];
  if (firstChar === "`" || firstChar === '"') {
    let i = trimmedStart + 1;
    while (i < rest.length) {
      if (rest[i] === "\\") { i += 2; continue; }
      if (rest[i] === firstChar) return rest.slice(trimmedStart + 1, i);
      i += 1;
    }
    return rest.slice(trimmedStart + 1);
  }
  if (firstChar === "[") {
    let depth = 0;
    let i = trimmedStart;
    let inStr = null;
    while (i < rest.length) {
      const c = rest[i];
      if (inStr) {
        if (c === "\\") { i += 2; continue; }
        if (c === inStr) inStr = null;
        i += 1; continue;
      }
      if (c === "`" || c === '"') { inStr = c; i += 1; continue; }
      if (c === "[") depth += 1;
      else if (c === "]") { depth -= 1; if (depth === 0) return rest.slice(trimmedStart, i + 1); }
      i += 1;
    }
    return rest.slice(trimmedStart);
  }
  return null;
}

/**
 * 扫描给定文件列表中 userPrompt 字面量赋值的 JSON schema 字段名泄露。
 * 仅扫字面量（模板串 `...` / 普通串 "..." / 数组 [...]），跳过函数动态构造
 * （如 userPrompt: buildXxxUserPrompt(...)）——后者需 code review 把关。
 * @param {string[]} filePaths 绝对路径列表
 * @returns {Array<{file: string, line: number, snippet: string}>}
 */
export function scanUserPromptSchemaLeak(filePaths) {
  const violations = [];
  for (const filePath of filePaths) {
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, "utf-8");
    const relPath = relative(root, filePath);
    const re = /userPrompt:\s*/g;
    let match;
    while ((match = re.exec(content)) !== null) {
      const rest = content.slice(match.index + match[0].length);
      const value = extractUserPromptValue(rest);
      if (value === null) continue; // 动态构造（函数/变量），跳过
      const hit = SCHEMA_LEAK_PATTERNS.find((p) => p.test(value));
      if (hit) {
        const line = content.slice(0, match.index).split("\n").length;
        const snippet = value.split("\n").slice(0, 3).join(" ").trim().slice(0, 160);
        violations.push({ file: relPath, line, snippet });
      }
    }
  }
  return violations;
}

/** 递归收集目录下所有 .ts 文件（排除 .test.ts / .d.ts） */
export function collectTsFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function runMain() {
  const failures = [];
  const reports = [];

  for (const spec of promptSpecs) {
    const filePath = resolve(promptDir, spec.file);
    if (!existsSync(filePath)) {
      failures.push(`${spec.file}: missing file`);
      continue;
    }
    const raw = readFileSync(filePath, "utf-8");
    const sections = parseSections(raw);
    if (!sections) {
      failures.push(`${spec.file}: missing # system or # user sections`);
      continue;
    }
    if (!/json/i.test(sections.system)) {
      failures.push(`${spec.file}: system section must explicitly require JSON output`);
    }
    for (const variable of spec.requiredVars) {
      if (!sections.user.includes(`{{${variable}}}`)) {
        failures.push(`${spec.file}: missing required variable {{${variable}}}`);
      }
    }

    const rendered = render(sections.user, {
      message: "请帮我推进当前迭代",
      role: "iteration-coach",
      scope: "full-cycle",
      goal: "完成需求澄清与边界确认",
      context: "迭代=订单中心；状态=in-progress；待确认=2",
      expectedOutput: "JSON: {summary, nextActions[]}"
    });

    if (/\{\{\w+\}\}/.test(rendered)) {
      failures.push(`${spec.file}: unresolved template variables after sample render`);
    }

    const systemLength = sections.system.length;
    const userLength = sections.user.length;
    if (systemLength < 180 || userLength < 60) {
      failures.push(`${spec.file}: prompt content too short (system=${systemLength}, user=${userLength})`);
    }

    reports.push({ file: spec.file, systemLength, userLength });
  }

  // 动态 userPrompt schema 泄露扫描（CLAUDE.md 第五节）
  const appFiles = collectTsFiles(resolve(root, "src", "application"));
  const leakViolations = scanUserPromptSchemaLeak(appFiles);
  for (const v of leakViolations) {
    failures.push(`${v.file}:${v.line}: userPrompt 泄露 JSON schema 字段名 — ${v.snippet}`);
  }

  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    promptDir,
    staticPrompts: reports,
    dynamicUserPromptScan: {
      scannedFiles: appFiles.length,
      violations: leakViolations.length,
      note: "仅扫字面量 userPrompt 赋值；函数动态构造（如 buildXxxUserPrompt）需 code review 把关"
    },
    failures
  }, null, 2));

  if (failures.length > 0) {
    process.exit(2);
  }
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  runMain();
}
