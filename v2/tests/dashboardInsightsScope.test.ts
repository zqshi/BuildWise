import assert from "node:assert/strict";
import test from "node:test";
import { filterIterationsByWindow, getScopeIterations, sortInsightsByLevel } from "../src/pages/dashboard/dashboardInsightScopeModel.ts";

test("project scope returns only selected project iterations", () => {
  const byProject = {
    1: [{ id: 11 }, { id: 12 }],
    2: [{ id: 21 }]
  } as unknown as Record<number, Array<{ id: number }>>;
  const rows = getScopeIterations("project", byProject as never, 2);
  assert.deepEqual(rows, byProject[2]);
});

test("portfolio scope aggregates iterations across projects", () => {
  const byProject = {
    1: [{ id: 11 }],
    2: [{ id: 21 }, { id: 22 }]
  } as unknown as Record<number, Array<{ id: number }>>;
  const rows = getScopeIterations("portfolio", byProject as never, 1);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((item) => item.id),
    [11, 21, 22]
  );
});

test("time window keeps recent iterations and unknown timestamps", () => {
  const now = new Date("2026-03-10T00:00:00.000Z");
  const rows = filterIterationsByWindow(
    [
      { id: 1, createdAt: "2026-03-01T00:00:00.000Z" },
      { id: 2, createdAt: "2025-12-01T00:00:00.000Z" },
      { id: 3 }
    ],
    30,
    now
  );
  assert.deepEqual(
    rows.map((item) => item.id),
    [1, 3]
  );
});

test("insights are sorted by risk first", () => {
  const rows = sortInsightsByLevel([
    { level: "good" as const, title: "A" },
    { level: "risk" as const, title: "B" },
    { level: "watch" as const, title: "C" }
  ]);
  assert.deepEqual(
    rows.map((item) => item.title),
    ["B", "C", "A"]
  );
});

