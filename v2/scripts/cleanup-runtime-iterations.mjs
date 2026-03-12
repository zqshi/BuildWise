import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const dataFile = resolve(process.cwd(), "backend", "data.runtime.json");
const pattern = new RegExp(process.env.CLEANUP_ITERATION_NAME_PATTERN || "(演示迭代|tmp)", "i");

const raw = JSON.parse(readFileSync(dataFile, "utf-8"));
const iterations = Array.isArray(raw.iterations) ? raw.iterations : [];
const removeIds = new Set(
  iterations
    .filter((item) => pattern.test(String(item?.name || "")))
    .map((item) => Number(item.id))
    .filter((id) => Number.isInteger(id) && id > 0)
);

if (removeIds.size === 0) {
  console.log(JSON.stringify({ removedIterations: 0, removeIds: [] }, null, 2));
  process.exit(0);
}

const pruneByIteration = (arr) =>
  Array.isArray(arr)
    ? arr.filter((item) => {
        const iterationId = Number(item?.iterationId);
        return !(Number.isInteger(iterationId) && removeIds.has(iterationId));
      })
    : [];

raw.iterations = Array.isArray(iterations)
  ? iterations.filter((item) => {
      const id = Number(item?.id);
      return !(Number.isInteger(id) && removeIds.has(id));
    })
  : [];
raw.messages = pruneByIteration(raw.messages);
raw.snapshots = pruneByIteration(raw.snapshots);
raw.transitions = pruneByIteration(raw.transitions);
raw.deployments = pruneByIteration(raw.deployments);
raw.templateRuns = pruneByIteration(raw.templateRuns);

writeFileSync(dataFile, `${JSON.stringify(raw, null, 2)}\n`, "utf-8");
console.log(
  JSON.stringify(
    {
      removedIterations: removeIds.size,
      removeIds: Array.from(removeIds).sort((a, b) => a - b),
      remainingIterations: raw.iterations.length
    },
    null,
    2
  )
);
