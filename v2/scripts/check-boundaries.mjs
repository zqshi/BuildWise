import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.join(path.dirname(__filename), ".."));
const exceptionFile = path.join(ROOT, "scripts", "boundary-exceptions.json");
const HARD_LINE_LIMIT = 1000;

function loadLineLimitExceptions() {
  if (!existsSync(exceptionFile)) {
    return new Set();
  }
  try {
    const payload = JSON.parse(readFileSync(exceptionFile, "utf-8"));
    const files = Array.isArray(payload?.lineLimitExceptions) ? payload.lineLimitExceptions : [];
    return new Set(files.map((item) => String(item).trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function loadHardLineLimitExceptions() {
  if (!existsSync(exceptionFile)) {
    return new Set();
  }
  try {
    const payload = JSON.parse(readFileSync(exceptionFile, "utf-8"));
    const files = Array.isArray(payload?.hardLineLimitExceptions) ? payload.hardLineLimitExceptions : [];
    return new Set(files.map((item) => String(item).trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

const limits = [
  { prefix: "src/domain/", max: 220 },
  { prefix: "src/infrastructure/", max: 220 },
  { prefix: "src/pages/auth/", max: 240 },
  { prefix: "src/pages/dashboard/", max: 320 },
  { prefix: "src/pages/layout/", max: 220 },
  { prefix: "src/pages/projects/", max: 360 },
  { prefix: "src/shared/", max: 180 },
  { prefix: "src/App.tsx", max: 260 },
  { prefix: "src/styles/app.css", max: 40 },
  { prefix: "src/styles/base.css", max: 260 },
  { prefix: "src/styles/layout.css", max: 320 },
  { prefix: "src/styles/dashboard.css", max: 260 },
  { prefix: "src/styles/workspace.css", max: 500 },
  { prefix: "src/styles/responsive.css", max: 160 },
  { prefix: "backend/src/domain/", max: 220 },
  { prefix: "backend/src/application/", max: 320 },
  { prefix: "backend/src/infrastructure/", max: 360 },
  { prefix: "backend/src/interfaces/", max: 280 },
  { prefix: "backend/src/index.ts", max: 140 },
  { prefix: "docs/", max: 220 }
];

function walkFiles(dir) {
  const results = [];
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const info = statSync(fullPath);
    if (info.isDirectory()) {
      results.push(...walkFiles(fullPath));
      continue;
    }
    if (!/\.(ts|tsx|css|md)$/.test(fullPath)) {
      continue;
    }
    results.push(fullPath);
  }
  return results;
}

function toRel(absPath) {
  return path.relative(ROOT, absPath).replaceAll(path.sep, "/");
}

function findLimit(relPath) {
  for (const rule of limits) {
    if (relPath.startsWith(rule.prefix)) {
      return rule.max;
    }
  }
  return null;
}

function importViolations(relPath, content) {
  const violations = [];
  const imports = [...content.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  if (relPath.startsWith("backend/src/domain/")) {
    if (imports.some((item) => item.includes("/application/") || item.includes("/infrastructure/") || item.includes("/interfaces/"))) {
      violations.push("Domain layer must not import application/infrastructure/interfaces.");
    }
  }
  if (relPath.startsWith("backend/src/application/")) {
    if (imports.some((item) => item.includes("/interfaces/"))) {
      violations.push("Application layer must not import interfaces.");
    }
  }
  if (relPath.startsWith("src/domain/")) {
    if (imports.some((item) => item.includes("/infrastructure/"))) {
      violations.push("Frontend domain layer must not import infrastructure layer.");
    }
  }
  return violations;
}

const files = [
  ...walkFiles(path.join(ROOT, "src")),
  ...walkFiles(path.join(ROOT, "backend", "src")),
  ...walkFiles(path.join(ROOT, "scripts")),
  ...walkFiles(path.join(ROOT, "backend", "scripts")),
  ...walkFiles(path.join(ROOT, "..", "docs"))
];

const errors = [];
const warnings = [];
const lineLimitExceptions = loadLineLimitExceptions();
const hardLineLimitExceptions = loadHardLineLimitExceptions();
for (const file of files) {
  const rel = toRel(file);
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n").length;
  if (lines > HARD_LINE_LIMIT && !hardLineLimitExceptions.has(rel)) {
    errors.push(`${rel}: ${lines} lines exceeds hard limit ${HARD_LINE_LIMIT}`);
  }
  const max = findLimit(rel);
  if (max !== null && lines > max && !lineLimitExceptions.has(rel)) {
    warnings.push(`${rel}: ${lines} lines exceeds per-prefix limit ${max}`);
  }
  for (const violation of importViolations(rel, content)) {
    errors.push(`${rel}: ${violation}`);
  }
}

if (warnings.length > 0) {
  console.warn(`Line limit warnings (${warnings.length}, per-prefix, non-blocking — record as tech debt, hard limit ${HARD_LINE_LIMIT} still enforced):`);
  for (const w of warnings) {
    console.warn(`- ${w}`);
  }
}

if (errors.length > 0) {
  console.error("Boundary check failed:");
  for (const err of errors) {
    console.error(`- ${err}`);
  }
  process.exit(1);
}

console.log("Boundary check passed.");
