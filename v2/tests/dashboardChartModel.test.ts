import assert from "node:assert/strict";
import test from "node:test";
import { buildProgressBarDetails, buildTrendChartPoints, hasProgressDistributionData, hasTrendData } from "../src/pages/dashboard/dashboardChartModel.ts";

test("progress distribution model exposes bucket detail copy for hover cards", () => {
  const details = buildProgressBarDetails(
    [
      { label: "0-25%", count: 2 },
      { label: "26-50%", count: 1 },
      { label: "51-75%", count: 0 },
      { label: "76-100%", count: 1 }
    ],
    4
  );

  assert.equal(details[0]?.detail, "0-25%：2 个迭代，占 50%。");
  assert.equal(details[0]?.height, 100);
  assert.equal(details[2]?.height >= 14, true);
  assert.equal(hasProgressDistributionData(details.map(({ label, count }) => ({ label, count }))), true);
});

test("trend chart model omits placeholder points and exposes month detail copy", () => {
  const points = buildTrendChartPoints([
    { label: "2026-01", count: 1 },
    { label: "2026-02", count: 3 },
    { label: "暂无", count: 0 }
  ]);

  assert.equal(points.length, 2);
  assert.equal(points[0]?.label, "26/01");
  assert.equal(points[1]?.detail, "2026-02：生成 3 次代码交付。");
  assert.equal(hasTrendData([{ label: "暂无", count: 0 }]), false);
});
