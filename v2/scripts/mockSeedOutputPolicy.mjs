import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function resolveMockSeedOutputs({ env, v2Dir, backendDir, scriptName }) {
  const mode = String(env.BUILDWISE_MOCK_SEED_MODE || "fixture").trim().toLowerCase() === "apply" ? "apply" : "fixture";
  const defaultFixturePath = resolve(v2Dir, ".artifacts", "mock-workspace", `${scriptName}.json`);
  const outputPath = resolve(
    String(env.BUILDWISE_MOCK_SEED_OUTPUT || (mode === "apply" ? resolve(backendDir, "data.json") : defaultFixturePath))
  );
  const runtimeOutputPath =
    mode === "apply"
      ? resolve(String(env.BUILDWISE_MOCK_SEED_RUNTIME_OUTPUT || resolve(backendDir, "data.runtime.json")))
      : null;

  ensureParentDir(outputPath);
  if (runtimeOutputPath) {
    ensureParentDir(runtimeOutputPath);
  }

  return {
    mode,
    outputPath,
    runtimeOutputPath
  };
}
