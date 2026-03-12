import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const stylesPath = new URL("../src/styles/workspace-core.css", import.meta.url);

test("project panel grid keeps dedicated row for search field", () => {
  const styles = readFileSync(stylesPath, "utf8");
  const projectPanelRule = styles.match(/\.project-panel\s*\{[\s\S]*?\}/);

  assert.ok(projectPanelRule, "missing .project-panel style rule");
  assert.match(
    projectPanelRule[0],
    /grid-template-rows\s*:\s*auto\s+auto\s+1fr\s+auto\s*;/,
    "project panel must reserve an explicit row for the search field",
  );
});
