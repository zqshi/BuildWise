#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRootDir = resolve(scriptDir, "..");
const rootDir = resolve(process.env.BUILDWISE_RESET_ROOT || defaultRootDir);
const backendDir = resolve(rootDir, "backend");
const now = new Date().toISOString();

function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function writeJson(filePath, payload) {
  ensureParentDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function removePath(targetPath) {
  if (!existsSync(targetPath)) {
    return false;
  }
  rmSync(targetPath, { recursive: true, force: true });
  return true;
}

function buildInitialWorkspaceStore(createdAt) {
  return {
    projects: [
      {
        id: 1,
        name: "构想智造平台",
        description: "统一项目模型驱动的迭代管理平台",
        status: "in-progress",
        icon: "cubes",
        iconColor: "blue",
        lastUpdated: createdAt.slice(0, 10)
      }
    ],
    iterations: [],
    messages: [],
    snapshots: [],
    transitions: [],
    auditLogs: [],
    versionSnapshots: [],
    projectShares: [],
    deployments: [],
    templateRuns: [],
    opsTriageTemplates: [],
    projectPolicies: [],
    projectWorkspaceBindings: [],
    policyExecutionLogs: [],
    projectRoleBindings: [],
    tenantMemberBindings: [],
    platformRoleBindings: [],
    governanceCustomRoles: []
  };
}

function buildInitialGlobalAssistantStore(createdAt) {
  return {
    conversations: [],
    messages: [],
    skills: [],
    strategyState: {
      activeSkillIds: [],
      customWorkflowDescriptions: [],
      lastResetAt: createdAt,
      updatedAt: createdAt
    }
  };
}

function resetBusinessEnvironment() {
  const workspaceStore = buildInitialWorkspaceStore(now);
  const targetFiles = [resolve(backendDir, "data.json"), resolve(backendDir, "data.runtime.json")];

  for (const filePath of targetFiles) {
    writeJson(filePath, workspaceStore);
  }

  writeJson(resolve(backendDir, "continuous-modeling.runtime.json"), { snapshots: [] });
  writeJson(resolve(backendDir, "global-assistant.runtime.json"), buildInitialGlobalAssistantStore(now));

  const removedPaths = [];
  const removablePaths = [
    resolve(rootDir, ".artifacts"),
    resolve(rootDir, "index"),
    resolve(rootDir, "memory"),
    resolve(rootDir, "shards"),
    resolve(rootDir, "workspace.json"),
    resolve(rootDir, ".buildwise"),
    resolve(rootDir, "tmp", "e2e-reports")
  ];

  for (const targetPath of removablePaths) {
    if (removePath(targetPath)) {
      removedPaths.push(targetPath);
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        rootDir,
        resetAt: now,
        dataFiles: targetFiles,
        continuousModelingFile: resolve(backendDir, "continuous-modeling.runtime.json"),
        globalAssistantFile: resolve(backendDir, "global-assistant.runtime.json"),
        removedPaths,
        projectOverviewMockButtonRemoved: true
      },
      null,
      2
    )}\n`
  );
}

if (process.argv.includes("--verify")) {
  const runtimePath = resolve(backendDir, "data.runtime.json");
  const payload = existsSync(runtimePath) ? JSON.parse(readFileSync(runtimePath, "utf-8")) : null;
  process.stdout.write(
    `${JSON.stringify(
      {
        exists: Boolean(payload),
        projectCount: Array.isArray(payload?.projects) ? payload.projects.length : 0,
        iterationCount: Array.isArray(payload?.iterations) ? payload.iterations.length : 0
      },
      null,
      2
    )}\n`
  );
} else {
  resetBusinessEnvironment();
}
