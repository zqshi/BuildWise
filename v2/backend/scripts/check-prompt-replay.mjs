import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const promptDir = resolve(root, "prompts");
const snapshotPath = resolve(promptDir, "prompt-replay.snapshot.json");

const promptFiles = [
  "agent.iteration-coach.v2.md",
  "agent.orchestrator.v2.md",
  "agent.requirements-analyst.v2.md",
  "agent.task-planner.v2.md",
  "agent.delivery-engineer.v2.md",
  "agent.qa-reviewer.v2.md",
  "agent.boundary-guardian.v2.md",
  "agent.release-ops-advisor.v2.md"
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

function digest(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function replayPrompt(file, sections) {
  const scenarios = [
    {
      message: "请帮我推进当前迭代",
      role: "iteration-coach",
      scope: "full-cycle",
      goal: "推进澄清与边界确认",
      context: "迭代=订单中心；状态=in-progress；待确认=2；边界=codePaths:src/api",
      expectedOutput: "JSON: {summary,nextActions[]}"
    },
    {
      message: "现在要做发布前检查",
      role: "iteration-coach",
      scope: "release",
      goal: "形成发布门禁结论",
      context: "迭代=支付风控；状态=review；风险=P0:回滚条件不完整",
      expectedOutput: "JSON: {releaseDecision,blockers[]}"
    },
    {
      message: "我们刚创建迭代，先告诉我该准备什么",
      role: "iteration-coach",
      scope: "iteration",
      goal: "引导首轮信息收集与上传",
      context: "迭代=新客激活；状态=planned；待确认=0；分析时间=none",
      expectedOutput: "JSON: {intent,guidance}"
    },
    {
      message: "测试矩阵里有两个 blocked，下一步怎么走",
      role: "iteration-coach",
      scope: "full-cycle",
      goal: "收敛阻断项并给出可执行动作",
      context: "迭代=订单结算；状态=in-progress；测试阻断=2；澄清未解=1",
      expectedOutput: "JSON: {nextActions,checklist}"
    }
  ];

  const rendered = scenarios.map((vars, idx) => ({
    scenario: idx + 1,
    systemHash: digest(render(sections.system, vars)),
    userHash: digest(render(sections.user, vars))
  }));

  return {
    file,
    systemLength: sections.system.length,
    userLength: sections.user.length,
    rendered
  };
}

const current = {
  generatedAt: new Date().toISOString(),
  items: promptFiles.map((file) => {
    const filePath = resolve(promptDir, file);
    if (!existsSync(filePath)) {
      return { file, missing: true };
    }
    const raw = readFileSync(filePath, "utf-8");
    const sections = parseSections(raw);
    if (!sections) {
      return { file, invalid: true };
    }
    return replayPrompt(file, sections);
  })
};

const argv = process.argv.slice(2);
if (argv.includes("--write")) {
  const output = JSON.stringify(current, null, 2);
  process.stdout.write(output + "\n");
  process.exit(0);
}

if (!existsSync(snapshotPath)) {
  console.error(`[prompt-replay] snapshot missing: ${snapshotPath}`);
  console.error("Run: node scripts/check-prompt-replay.mjs --write > prompts/prompt-replay.snapshot.json");
  process.exit(2);
}

const snapshot = JSON.parse(readFileSync(snapshotPath, "utf-8"));
const normalize = (value) =>
  JSON.stringify({
    items: value.items
  });

const same = normalize(snapshot) === normalize(current);
if (!same) {
  console.error("[prompt-replay] snapshot mismatch detected");
  console.error("Expected:");
  console.error(JSON.stringify(snapshot.items, null, 2));
  console.error("Current:");
  console.error(JSON.stringify(current.items, null, 2));
  process.exit(2);
}

console.log(JSON.stringify({ checkedAt: new Date().toISOString(), snapshot: snapshotPath, status: "ok", items: current.items.length }, null, 2));
