import test from "node:test";
import assert from "node:assert/strict";
import {
  marketingFeatures,
  marketingHeroStats,
  marketingJourney,
  marketingProblems,
  marketingSolutions
} from "../src/pages/marketing/marketingContent.ts";

test("marketing hero remains concise and metric-led", () => {
  assert.equal(marketingHeroStats.length, 3);
  assert.equal(marketingHeroStats[0]?.value, "15");
  assert.match(marketingHeroStats[1]?.label ?? "", /全生命周期/);
});

test("problem and solution framing stays symmetrical", () => {
  assert.equal(marketingProblems.length, 3);
  assert.equal(marketingSolutions.length, 3);
  assert.match(marketingProblems[0]?.title ?? "", /需求/);
  assert.match(marketingSolutions[0]?.title ?? "", /上传文档/);
});

test("feature grid stays compact and high-signal", () => {
  assert.equal(marketingFeatures.length, 4);
  assert.match(marketingFeatures.map((item) => item.icon).join(""), /◉.*◌.*△.*▣/);
});

test("journey keeps a simple three-step premium flow", () => {
  assert.equal(marketingJourney.length, 3);
  assert.equal(marketingJourney[0]?.index, "01");
  assert.match(marketingJourney[2]?.title ?? "", /交付/);
  assert.equal(marketingJourney[0]?.details.length, 3);
  assert.match(marketingJourney[1]?.details.join(" ") ?? "", /澄清问题|验收标准/);
});
