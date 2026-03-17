import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("coachIterationMessage uses long timeout for real LLM chat", () => {
  const source = readFileSync(new URL("../src/app/workspaceApiAgentOps.ts", import.meta.url), "utf8");
  assert.match(source, /coachIterationMessage[\s\S]*fetchJSON<IterationCoachChatResponse>[\s\S]*180000/);
});
