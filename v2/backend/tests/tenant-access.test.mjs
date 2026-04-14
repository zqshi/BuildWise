import test from "node:test";
import assert from "node:assert/strict";
import { createInMemoryWorkspaceRepo } from "./helpers/mock-factories.mjs";

const { WorkspaceService } = await import("../dist/application/workspace/shared/workspaceService.js");

function buildServiceWithProjects() {
  const repo = createInMemoryWorkspaceRepo();
  const now = new Date().toISOString();
  repo._store.projects.push(
    {
      id: 1,
      name: "Tenant A",
      description: "",
      status: "active",
      tenantId: "owner-a",
      ownerUserId: "owner-a",
      createdAt: now,
      updatedAt: now
    },
    {
      id: 2,
      name: "Tenant B",
      description: "",
      status: "active",
      tenantId: "owner-b",
      ownerUserId: "owner-b",
      createdAt: now,
      updatedAt: now
    }
  );
  repo._store.iterations.push({
    id: 11,
    projectId: 1,
    title: "迭代 1",
    goal: "验证多租户",
    status: "planning",
    createdAt: now,
    updatedAt: now
  });
  return { repo, service: new WorkspaceService(repo, null, null) };
}

test("tenant owner only lists projects inside own tenant", () => {
  const { service } = buildServiceWithProjects();

  const ownerAProjects = service.project.listProjectsForUser("owner-a");
  const ownerBProjects = service.project.listProjectsForUser("owner-b");

  assert.deepEqual(ownerAProjects.map((item) => item.id), [1]);
  assert.deepEqual(ownerBProjects.map((item) => item.id), [2]);
  assert.equal(ownerAProjects[0].currentUserRole, "owner");
});

test("tenant member can read and write owner tenant project after invitation", () => {
  const { service } = buildServiceWithProjects();

  service.governance.upsertTenantMemberBinding({
    tenantId: "owner-a",
    userId: "member-a",
    role: "member"
  });

  const listed = service.project.listProjectsForUser("member-a");
  const access = service.project.getProjectAccess("member-a", 1);
  const iterationAccess = service.iteration.getIterationAccess("member-a", 11);

  assert.deepEqual(listed.map((item) => item.id), [1]);
  assert.equal(access.canRead, true);
  assert.equal(access.canWrite, true);
  assert.equal(access.canManageTenant, false);
  assert.equal(iterationAccess.projectAccess.canWrite, true);
});

test("non-tenant user cannot read foreign tenant project", () => {
  const { service } = buildServiceWithProjects();

  const listed = service.project.listProjectsForUser("outsider");
  const access = service.project.getProjectAccess("outsider", 1);
  const iterationAccess = service.iteration.getIterationAccess("outsider", 11);

  assert.deepEqual(listed, []);
  assert.equal(access.canRead, false);
  assert.equal(access.canWrite, false);
  assert.equal(iterationAccess.projectAccess.canRead, false);
});

test("platform-only member does not gain synthetic owner tenant access", () => {
  const { service } = buildServiceWithProjects();

  const tenants = service.project.listAccessibleTenants("platform-member");

  assert.deepEqual(tenants, []);
});
