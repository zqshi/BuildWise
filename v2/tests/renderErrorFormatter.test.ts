import assert from "node:assert/strict";
import test from "node:test";
import { formatRenderError } from "../src/shared/renderErrorFormatter.ts";

test("formatRenderError returns error name and message", () => {
  const detail = formatRenderError(new TypeError("boom"));
  assert.deepEqual(detail, {
    title: "TypeError",
    message: "boom"
  });
});

test("formatRenderError handles plain string", () => {
  const detail = formatRenderError(" failed render ");
  assert.deepEqual(detail, {
    title: "RenderError",
    message: "failed render"
  });
});

test("formatRenderError falls back for unknown values", () => {
  const detail = formatRenderError(null);
  assert.deepEqual(detail, {
    title: "RenderError",
    message: "界面渲染异常"
  });
});
