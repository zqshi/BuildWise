import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

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

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), promptDir, reports, failures }, null, 2));

if (failures.length > 0) {
  process.exit(2);
}
