import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { computeProjectOverviewHealthScore } from "../src/pages/projects/projectOverviewPanelHelpers.ts";

test("computeProjectOverviewHealthScore derives score from live project signals", () => {
  const score = computeProjectOverviewHealthScore({
    projectProgress: 4,
    modelRuleCount: 1,
    modelEntityCount: 64,
    modelRelationCount: 0,
    modelPageCount: 16,
    repoHealth: {
      remoteConfigured: false,
      remoteReachable: false,
      remoteSynced: false
    },
    runtimeStatus: "ok"
  });

  assert.equal(score, 56);
});

test("project overview uses computed health score instead of missing ops metric", () => {
  const source = readFileSync(new URL("../src/pages/projects/ProjectOverviewPanel.tsx", import.meta.url), "utf8");

  assert.match(source, /computeProjectOverviewHealthScore/);
  assert.doesNotMatch(source, /project_governance_health_score/);
});

test("project overview removes runtime status card and keeps repository setting entry", () => {
  const source = readFileSync(new URL("../src/pages/projects/ProjectOverviewPanel.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(source, /<h3>运行状态<\/h3>/);
  assert.match(source, /<h3>代码仓设置<\/h3>/);
  assert.match(source, /打开设置面板/);
});
