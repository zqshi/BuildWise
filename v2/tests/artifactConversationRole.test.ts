import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sourcePath = new URL("../backend/src/application/workspace/workspaceServiceChangeControlArtifactOps.ts", import.meta.url);

test("appendIterationArtifactToConversationOp writes artifact references as assistant messages", () => {
  const source = readFileSync(sourcePath, "utf8");

  assert.match(
    source,
    /repo\.createMessage\(iterationId,\s*"assistant",\s*message\)/,
    "artifact references appended to the conversation must be authored by assistant, not user",
  );
  assert.doesNotMatch(
    source,
    /repo\.createMessage\(iterationId,\s*"user",\s*message\)/,
    "artifact references must never be persisted as user messages",
  );
});
