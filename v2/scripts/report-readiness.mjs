import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = path.resolve(path.join(import.meta.dirname, ".."));
const workspaceRoot = path.resolve(path.join(root, ".."));

function read(file) {
  return readFileSync(path.join(workspaceRoot, file), "utf-8");
}

function listFrontendSourceFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      results.push(...listFrontendSourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

function extractFrontendApis(content) {
  const endpoints = new Set();
  const templateRe = /\$\{API_BASE\}(?:\$\{API_PREFIX\})?(\/[^"'`\s]+)?/g;
  for (const match of content.matchAll(templateRe)) {
    const suffix = match[1] || "";
    const resolvedPath =
      suffix === "/health" || suffix === "/ready" || suffix === "/metrics"
        ? suffix
        : suffix.startsWith("/api/")
          ? suffix
          : `/api/v1${suffix}`;
    const normalized = normalizeApiPath(resolvedPath) || resolvedPath;
    if (normalized) {
      endpoints.add(normalized);
    }
  }
  const prefixedTemplateRe = /\$\{API_PREFIX\}(\/[^"'`\s]+)/g;
  for (const match of content.matchAll(prefixedTemplateRe)) {
    const normalized = normalizeApiPath(`/api/v1${match[1]}`);
    if (normalized) {
      endpoints.add(normalized);
    }
  }
  const literalRe = /["'`](\/api\/[^"'`\s]+)["'`]/g;
  for (const match of content.matchAll(literalRe)) {
    const normalized = normalizeApiPath(match[1]);
    if (normalized) {
      endpoints.add(normalized);
    }
  }
  return [...endpoints].sort();
}

function extractRoutePaths(content) {
  const routes = [];
  const re = /app\.(get|post|put|patch|delete)\((["'`])([^"'`]+)\2/g;
  for (const match of content.matchAll(re)) {
    routes.push(match[3]);
  }
  return routes;
}

function normalizeApiPath(value) {
  if (!value || value === "/api/v1") {
    return "";
  }
  const [rawPath] = value.split("?");
  const normalized = rawPath
    .replace(/\$\{[^}]+\}/g, ":param")
    .replace(/\/:[^/]+/g, "/:param")
    .replace(/\/{2,}/g, "/")
    .replace(/\/api\/v1\/api\/v1\b/g, "/api/v1")
    .replace(/\/+$/g, "");
  if (!normalized.startsWith("/api/")) {
    return "";
  }
  return normalized;
}

function normalizeBackendRoute(route) {
  if (!route) {
    return "";
  }
  if (route.startsWith("/api/")) {
    return normalizeApiPath(route);
  }
  if (route === "/health" || route === "/ready" || route === "/metrics") {
    return route;
  }
  return normalizeApiPath(`/api/v1${route}`);
}

function shouldIgnoreFrontendEndpoint(endpoint) {
  return endpoint === "/api/v1/auth" || endpoint === "/api/v1/collab/share";
}

function pathMatches(frontendPath, backendPath) {
  const frontPath = normalizeApiPath(frontendPath) || frontendPath;
  const backPath = normalizeBackendRoute(backendPath) || backendPath;
  if (frontPath === backPath) {
    return true;
  }
  if (frontPath.endsWith("/") && backPath.startsWith(frontPath)) {
    return true;
  }
  const front = frontPath.split("/").filter(Boolean);
  const back = backPath.split("/").filter(Boolean);
  if (front.length !== back.length) {
    if (front.length < back.length && frontendPath.endsWith("/")) {
      return back.slice(0, front.length).every((segment, index) => {
        const frontSegment = front[index];
        if (frontSegment === ":param") {
          return true;
        }
        return frontSegment === segment || segment.startsWith(":");
      });
    }
    return false;
  }
  for (let i = 0; i < front.length; i += 1) {
    if (back[i].startsWith(":")) {
      continue;
    }
    if (front[i] === ":param") {
      continue;
    }
    if (front[i] !== back[i]) {
      return false;
    }
  }
  return true;
}

const frontendSources = listFrontendSourceFiles(path.join(workspaceRoot, "v2", "src"))
  .map((file) => readFileSync(file, "utf-8"))
  .join("\n");
function listRouteFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) {
      results.push(...listRouteFiles(full));
      continue;
    }
    if (/Routes\.ts$/.test(entry)) {
      results.push(full);
    }
  }
  return results;
}

const frontendApis = extractFrontendApis(frontendSources);
const routeFiles = listRouteFiles(path.join(workspaceRoot, "v2", "backend", "src", "interfaces", "http", "routes"));
const backendRoutes = [
  ...routeFiles.flatMap((file) => extractRoutePaths(readFileSync(file, "utf-8")))
];

const uniqueBackendRoutes = [...new Set(backendRoutes.map((route) => normalizeBackendRoute(route) || route))].sort();
const matched = [];
const unmatched = [];

for (const endpoint of frontendApis) {
  if (shouldIgnoreFrontendEndpoint(endpoint)) {
    continue;
  }
  if (uniqueBackendRoutes.some((route) => pathMatches(endpoint, route))) {
    matched.push(endpoint);
  } else {
    unmatched.push(endpoint);
  }
}

const coverage = frontendApis.length === 0 ? 1 : matched.length / frontendApis.length;
const placeholderCount = (frontendSources.match(/>图表区域</g) || []).length;
const faviconExists = existsSync(path.join(workspaceRoot, "v2/public/favicon.svg"));

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
function resolveReportOutputDir() {
  const explicitDir = process.env.BUILDWISE_READINESS_OUTPUT_DIR?.trim();
  if (explicitDir) {
    return path.resolve(workspaceRoot, explicitDir);
  }
  if (process.env.BUILDWISE_READINESS_WRITE_REPO === "1") {
    return path.join(workspaceRoot, "docs", "milestones");
  }
  return path.join(os.tmpdir(), "buildwise-readiness");
}

const outDir = resolveReportOutputDir();
mkdirSync(outDir, { recursive: true });
const reportFile = path.join(outDir, `readiness-${timestamp}.md`);

const lines = [
  "# 前后端完备度与体验检查",
  "",
  `- 时间: ${new Date().toISOString()}`,
  `- 前端接口数: ${frontendApis.length}`,
  `- 后端路由数(去重): ${uniqueBackendRoutes.length}`,
  `- 接口覆盖率: ${(coverage * 100).toFixed(1)}%`,
  `- 图表占位残留: ${placeholderCount}`,
  `- favicon: ${faviconExists ? "已配置" : "缺失"}`,
  "",
  "## 已覆盖接口",
  ...matched.map((item) => `- ${item}`),
  "",
  "## 未覆盖接口",
  ...(unmatched.length === 0 ? ["- 无"] : unmatched.map((item) => `- ${item}`)),
  "",
  "## 结论",
  unmatched.length === 0
    ? "- 前端已使用接口全部存在对应后端路由。"
    : "- 存在前端调用未覆盖接口，需优先补齐。",
  placeholderCount === 0
    ? "- 前端仪表盘已无纯占位图表文案。"
    : "- 前端仍有占位图表，需要替换为真实可视化。"
];

writeFileSync(reportFile, `${lines.join("\n")}\n`, "utf-8");
console.log(reportFile);
