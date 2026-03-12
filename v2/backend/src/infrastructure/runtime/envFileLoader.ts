import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type EnvMap = Record<string, string | undefined>;

export type EnvFileLoadOptions = {
  cwd: string;
  env: EnvMap;
  fileName?: string;
  overrideExisting?: boolean;
  overrideKeys?: string[];
};

export type EnvFileLoadResult = {
  loaded: number;
  skipped: number;
  overridden: number;
  filePath: string;
};

function stripOuterQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function loadEnvFileIntoMap(options: EnvFileLoadOptions): EnvFileLoadResult {
  const filePath = join(options.cwd, options.fileName || ".env");
  if (!existsSync(filePath)) {
    return { loaded: 0, skipped: 0, overridden: 0, filePath };
  }
  const content = readFileSync(filePath, "utf-8");
  const overrideExisting = options.overrideExisting === true;
  const forcedOverrideKeys = new Set((options.overrideKeys || []).map((item) => item.trim()).filter(Boolean));
  let loaded = 0;
  let skipped = 0;
  let overridden = 0;
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const idx = line.indexOf("=");
    if (idx <= 0) {
      continue;
    }
    const key = line.slice(0, idx).trim();
    if (!key) {
      continue;
    }
    const value = stripOuterQuotes(line.slice(idx + 1));
    const alreadyExists = options.env[key] !== undefined;
    const forceOverride = forcedOverrideKeys.has(key);
    if (alreadyExists && !overrideExisting && !forceOverride) {
      skipped += 1;
      continue;
    }
    if (alreadyExists) {
      overridden += 1;
    }
    options.env[key] = value;
    loaded += 1;
  }
  return { loaded, skipped, overridden, filePath };
}
