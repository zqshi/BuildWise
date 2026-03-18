import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const { WorkspaceService } = await import("../dist/application/workspace/workspaceService.js");
const { JsonWorkspaceRepository } = await import("../dist/infrastructure/persistence/jsonWorkspaceRepository.js");

function createWorkspaceService() {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), "buildwise-workspace-repo-"));
  const dataFile = path.join(fixtureDir, "workspace.json");
  writeFileSync(
    dataFile,
    JSON.stringify(
      {
        projects: [],
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
        platformRoleBindings: [],
        governanceCustomRoles: []
      },
      null,
      2
    ),
    "utf-8"
  );
  const repository = new JsonWorkspaceRepository(dataFile);
  return new WorkspaceService(repository, null);
}

test("repository bootstrap stores remote metadata without probing remote reachability", () => {
  const service = createWorkspaceService();
  const project = service.createProject({
    name: "Repository Bootstrap Contract Project",
    description: "bootstrap should only persist remote metadata"
  });

  const bootstrap = service.bootstrapProjectRepository(project.id, {
    provider: "github",
    organization: "buildwise-contract",
    name: "placeholder-remote",
    url: "https://example.invalid/buildwise-contract-placeholder.git",
    defaultBranch: "main",
    repoMode: "external_git",
    requireRemoteForProduction: true,
    requireRemoteForStaging: false
  });

  assert.equal(bootstrap.ok, true);
  if (!bootstrap.ok) {
    return;
  }
  assert.equal(bootstrap.data.url, "https://example.invalid/buildwise-contract-placeholder.git");
  assert.equal(bootstrap.data.repoMode, "external_git");
});

test("repository validate still rejects unreachable remotes after bootstrap", () => {
  const service = createWorkspaceService();
  const project = service.createProject({
    name: "Repository Validate Contract Project",
    description: "validate should remain explicit"
  });

  const bootstrap = service.bootstrapProjectRepository(project.id, {
    provider: "github",
    organization: "buildwise-contract",
    name: "placeholder-remote",
    url: "https://example.invalid/buildwise-contract-placeholder.git",
    defaultBranch: "main",
    repoMode: "external_git"
  });
  assert.equal(bootstrap.ok, true);

  const validation = service.validateProjectRepositoryRemote(project.id, {});
  assert.equal(validation.ok, false);
  if (validation.ok) {
    return;
  }
  assert.equal(validation.reason, "remote_validation_failed");
  assert.match(validation.message || "", /not known|not found|failed|Could not resolve host|Name or service not known/i);
});
