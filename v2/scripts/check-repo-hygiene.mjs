import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.join(path.dirname(__filename), "..", ".."));

function run(command) {
  return execSync(command, { cwd: ROOT, encoding: "utf-8" }).trim();
}

function tracked(pattern) {
  const out = run(`git ls-files ${pattern} 2>/dev/null || true`);
  return out.split("\n").map((item) => item.trim()).filter(Boolean);
}

function listTrackedFiles(prefix) {
  const out = run(`git ls-files ${prefix} 2>/dev/null || true`);
  return out.split("\n").map((item) => item.trim()).filter(Boolean);
}

function read(relPath) {
  return readFileSync(path.join(ROOT, relPath), "utf-8");
}

const errors = [];
const trackedDist = [...tracked("v2/dist"), ...tracked("v2/backend/dist")];
if (trackedDist.length > 0) {
  errors.push(`构建产物不应入库（dist）：${trackedDist.slice(0, 12).join(" | ")}${trackedDist.length > 12 ? " ..." : ""}`);
}
const trackedDsStore = tracked(".DS_Store");
if (trackedDsStore.length > 0) {
  errors.push(`.DS_Store 不应被跟踪：${trackedDsStore.join(" | ")}`);
}
const trackedAutobootRuntime = [...tracked("autoboot/archive"), ...tracked("autoboot/runs"), ...tracked("autoboot/reports")];
if (trackedAutobootRuntime.length > 0) {
  errors.push(`autoboot 运行与归档产物不应入库：${trackedAutobootRuntime.slice(0, 12).join(" | ")}${trackedAutobootRuntime.length > 12 ? " ..." : ""}`);
}
const trackedAutobootState = [...tracked("autoboot/__pycache__"), ...tracked("autoboot/state"), ...tracked("autoboot/plans"), ...tracked("*.pyc")];
if (trackedAutobootState.length > 0) {
  errors.push(`autoboot 运行态文件不应入库：${trackedAutobootState.slice(0, 12).join(" | ")}${trackedAutobootState.length > 12 ? " ..." : ""}`);
}

const readme = read("v2/README.md");
if (/\/Users\//.test(readme)) {
  errors.push("v2/README.md 存在绝对路径，请改为相对路径。");
}
const backendReadme = read("v2/backend/README.md");
if (/\/Users\//.test(backendReadme)) {
  errors.push("v2/backend/README.md 存在绝对路径，请改为相对路径。");
}

const candidateFiles = [...listTrackedFiles("docs"), ...listTrackedFiles("v2"), ...listTrackedFiles("autoboot")]
  .filter((item) => /\.(md|ts|tsx|js|mjs|json|sh)$/i.test(item))
  .filter(
    (item) =>
      !item.includes("/node_modules/") &&
      !item.includes("/dist/") &&
      !item.startsWith("autoboot/runs/") &&
      !item.startsWith("autoboot/archive/") &&
      !item.startsWith("autoboot/reports/") &&
      !item.startsWith("autoboot/plans/") &&
      !item.startsWith("autoboot/state/")
  );
for (const file of candidateFiles) {
  const content = read(file);
  if (/\/Users\/zqs\/Downloads\/project\/BuildWise/.test(content)) {
    errors.push(`${file} 存在绝对路径，请改为仓库相对路径。`);
    break;
  }
}

if (errors.length > 0) {
  console.error("Repo hygiene check failed:");
  for (const err of errors) {
    console.error(`- ${err}`);
  }
  process.exit(1);
}

console.log("Repo hygiene check passed.");
