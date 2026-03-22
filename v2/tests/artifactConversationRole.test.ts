import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const opsPath = new URL("../backend/src/application/workspace/workspaceServiceChangeControlArtifactOps.ts", import.meta.url);
const policyPath = new URL("../backend/src/application/workspace/workspaceArtifactConversationPolicy.ts", import.meta.url);

test("appendIterationArtifactToConversationOp writes artifact references as assistant messages", () => {
  const opsSource = readFileSync(opsPath, "utf8");
  const policySource = readFileSync(policyPath, "utf8");

  // The ops layer delegates to publishArtifactReferenceMessage
  assert.match(
    opsSource,
    /publishArtifactReferenceMessage\(repo,\s*iterationId/,
    "appendIterationArtifactToConversationOp must delegate to publishArtifactReferenceMessage",
  );

  // The policy layer persists artifact references as assistant messages
  assert.match(
    policySource,
    /repo\.createMessage\(iterationId,\s*"assistant",\s*content\)/,
    "artifact references appended to the conversation must be authored by assistant, not user",
  );
  assert.doesNotMatch(
    policySource,
    /repo\.createMessage\(iterationId,\s*"user"/,
    "artifact references must never be persisted as user messages",
  );
});
