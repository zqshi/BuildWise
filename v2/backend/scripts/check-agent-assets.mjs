import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const agentsRoot = resolve(root, "agents");
const catalogPath = resolve(agentsRoot, "catalog", "agents.v1.json");

const failures = [];
const reports = [];

for (const requiredDir of [
  "catalog",
  "prompts",
  "workflows/fixed",
  "workflows/dynamic",
  "function-prompts",
  "adapters"
]) {
  const dirPath = resolve(agentsRoot, requiredDir);
  if (!existsSync(dirPath)) {
    failures.push(`missing directory: agents/${requiredDir}`);
  }
}

if (!existsSync(catalogPath)) {
  failures.push("missing catalog file: agents/catalog/agents.v1.json");
} else {
  try {
    const catalog = JSON.parse(readFileSync(catalogPath, "utf-8"));
    const agents = Array.isArray(catalog?.agents) ? catalog.agents : [];
    if (agents.length === 0) {
      failures.push("catalog has no agents");
    }

    for (const item of agents) {
      const role = typeof item?.role === "string" ? item.role.trim() : "";
      if (!role) {
        failures.push("catalog contains invalid role entry");
        continue;
      }
      const candidates = [
        resolve(agentsRoot, "prompts", `agent.${role}.v2.md`)
      ];
      const matched = candidates.find((path) => existsSync(path));
      if (!matched) {
        failures.push(`missing prompt in agents/prompts for role=${role}`);
        continue;
      }
      const raw = readFileSync(matched, "utf-8");
      const lower = raw.toLowerCase();
      if (!lower.includes("# system") || !lower.includes("# user")) {
        failures.push(`prompt missing sections for role=${role}: ${matched}`);
      }
      // iteration-coach 是对话风格 prompt（沟通风格/职责/状态感知规则/输出格式），与结构化 prompt 不同，豁免 3 section 硬要求
      const isDialoguePrompt = role === "iteration-coach";
      if (!isDialoguePrompt) {
        if (!raw.includes("遵循原则")) {
          failures.push(`prompt missing '遵循原则' section for role=${role}: ${matched}`);
        }
        if (!raw.includes("工作策略")) {
          failures.push(`prompt missing '工作策略' section for role=${role}: ${matched}`);
        }
        if (!raw.includes("输出要求")) {
          failures.push(`prompt missing '输出要求' section for role=${role}: ${matched}`);
        }
      }
      if (!/JSON/i.test(raw)) {
        failures.push(`prompt must require JSON output for role=${role}: ${matched}`);
      }
      reports.push({ role, prompt: matched.replace(`${root}/`, "") });
    }
  } catch (error) {
    failures.push(`invalid catalog JSON: ${(error && error.message) || "unknown"}`);
  }
}

const adapterPath = resolve(agentsRoot, "adapters", "agent-scope.json");
if (!existsSync(adapterPath)) {
  failures.push("missing adapter config: agents/adapters/agent-scope.json");
}

const fixedWorkflowCandidates = [
  resolve(agentsRoot, "workflows", "fixed", "default.single-agent.json")
];
for (const p of fixedWorkflowCandidates) {
  if (!existsSync(p)) {
    failures.push(`missing fixed workflow: ${p.replace(`${root}/`, "")}`);
  }
}

console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      agentsRoot,
      reports,
      failures
    },
    null,
    2
  )
);

if (failures.length > 0) {
  process.exit(2);
}
