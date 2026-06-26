import test from "node:test";
import assert from "node:assert/strict";
import { shouldShowStopButton } from "../src/app/fullCycleStopButton.ts";
import type { ChatSendStatus } from "../src/domain/workspace/types";

const job = { iterationId: 1, jobId: "fc-1" };

test("全流程运行中且持有 jobId 时显示停止按钮", () => {
  assert.equal(shouldShowStopButton("processing-full-cycle", job), true);
});

test("processing-full-cycle 但句柄未落定（无 jobId）时不显示——避免点了没 jobId 可取消", () => {
  assert.equal(shouldShowStopButton("processing-full-cycle", null), false);
});

test("非全流程运行态即使残留 jobId 也不显示", () => {
  const otherStatuses: ChatSendStatus[] = [
    "idle", "sending", "sent", "processing", "processing-executing", "processing-artifacts", "failed"
  ];
  for (const status of otherStatuses) {
    assert.equal(shouldShowStopButton(status, job), false);
  }
});

test("idle 且无 jobId 不显示", () => {
  assert.equal(shouldShowStopButton("idle", null), false);
});
