import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { WorkspaceRepository } from "../../domain/workspace/repository";

type OpenclawRuntimeConfig = {
  openclaw?: {
    sourcePath?: string;
    entry?: string;
    profile?: string;
    agentId?: string;
    homePath?: string;
  };
  assistant?: {
    personaPromptFile?: string;
  };
};

export type OpenclawDirectChatResult = {
  mode: "openclaw-native";
  profile: string;
  agentId: string;
  workspacePath: string;
  reply: string;
  at: string;
};

export type OpenclawIntegrationStatus = {
  runtimeConfigFound: boolean;
  openclawRoot: string;
  openclawEntry: string;
  openclawEntryExists: boolean;
  profile: string;
  agentId: string;
  openclawHome: string;
  openclawHomeWritable: boolean;
  authProfilePath: string;
  authConfigured: boolean;
  modelStatusChecked: boolean;
  modelAuthSource: string;
  integrated: boolean;
  reason: string;
};

function readRuntimeConfig(): OpenclawRuntimeConfig {
  const runtimePath = resolve(process.cwd(), "openclaw", "runtime.config.json");
  if (!existsSync(runtimePath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(runtimePath, "utf-8")) as OpenclawRuntimeConfig;
  } catch {
    return {};
  }
}

function runtimeConfigPath() {
  return resolve(process.cwd(), "openclaw", "runtime.config.json");
}

function resolveOpenclawHome(runtime: OpenclawRuntimeConfig) {
  const fromRuntime = (runtime.openclaw?.homePath || "").trim();
  if (fromRuntime) {
    return fromRuntime;
  }
  const fromEnv = (process.env.OPENCLAW_HOME || "").trim();
  if (fromEnv) {
    return fromEnv;
  }
  return "";
}

function ensureOpenclawHomeWritable(homePath: string) {
  if (!homePath) {
    return true;
  }
  try {
    mkdirSync(homePath, { recursive: true });
    mkdirSync(resolve(homePath, "agents"), { recursive: true });
    return true;
  } catch {
    return false;
  }
}

function resolveRuntimePaths(runtime: OpenclawRuntimeConfig) {
  const openclawRoot = runtime.openclaw?.sourcePath?.trim() || "";
  const openclawEntry = resolve(openclawRoot || ".", runtime.openclaw?.entry?.trim() || "openclaw.mjs");
  const profile = runtime.openclaw?.profile?.trim() || "buildwise-local";
  const agentId = runtime.openclaw?.agentId?.trim() || "main";
  const openclawHome = resolveOpenclawHome(runtime);
  const openclawHomeWritable = ensureOpenclawHomeWritable(openclawHome);
  return {
    openclawRoot,
    openclawEntry,
    profile,
    agentId,
    openclawHome,
    openclawHomeWritable
  };
}

function profileStateRoot(profile: string, openclawHome = "") {
  if (openclawHome) {
    return resolve(openclawHome, `.openclaw-${profile}`);
  }
  return resolve(process.env.HOME || "", `.openclaw-${profile}`);
}

function ensureFallbackStateFromDefault(profile: string, agentId: string) {
  const fallbackHome = resolve(process.cwd(), ".runtime", "openclaw-home");
  const sourceProfileRoot = profileStateRoot(profile);
  const targetProfileRoot = profileStateRoot(profile, fallbackHome);
  const sourceAgentDir = resolve(sourceProfileRoot, "agents", agentId, "agent");
  const targetAgentDir = resolve(targetProfileRoot, "agents", agentId, "agent");
  try {
    mkdirSync(targetProfileRoot, { recursive: true });
    mkdirSync(targetAgentDir, { recursive: true });
    const sourceConfig = resolve(sourceProfileRoot, "openclaw.json");
    const targetConfig = resolve(targetProfileRoot, "openclaw.json");
    if (existsSync(sourceConfig) && !existsSync(targetConfig)) {
      copyFileSync(sourceConfig, targetConfig);
    }
    const mirrors = ["auth-profiles.json", "models.json"];
    for (const file of mirrors) {
      const src = resolve(sourceAgentDir, file);
      const dst = resolve(targetAgentDir, file);
      if (existsSync(src) && !existsSync(dst)) {
        copyFileSync(src, dst);
      }
    }
    return fallbackHome;
  } catch {
    return "";
  }
}

function isPermissionLockError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return text.includes("sessions.json.lock") && (text.includes("operation not permitted") || text.includes("EACCES") || text.includes("EPERM"));
}

function runOpenclawCommand(
  runtimePaths: ReturnType<typeof resolveRuntimePaths>,
  args: string[]
) {
  const run = (envOverride?: Record<string, string | undefined>) =>
    execFileSync("node", args, {
      cwd: runtimePaths.openclawRoot,
      encoding: "utf-8",
      maxBuffer: 2 * 1024 * 1024,
      timeout: 120000,
      env: envOverride || process.env
    }).trim();

  const baseEnv = runtimePaths.openclawHome
    ? {
        ...process.env,
        OPENCLAW_HOME: runtimePaths.openclawHome
      }
    : undefined;
  try {
    return run(baseEnv);
  } catch (error) {
    if (runtimePaths.openclawHome || !isPermissionLockError(error)) {
      throw error;
    }
    const fallbackHome = ensureFallbackStateFromDefault(runtimePaths.profile, runtimePaths.agentId);
    if (!fallbackHome) {
      throw error;
    }
    return run({
      ...process.env,
      OPENCLAW_HOME: fallbackHome
    });
  }
}

function authProfilePath(profile: string, agentId: string, openclawHome: string) {
  const profileDir = openclawHome
    ? resolve(openclawHome, `.openclaw-${profile}`)
    : resolve(process.env.HOME || "", `.openclaw-${profile}`);
  return resolve(profileDir, "agents", agentId, "agent", "auth-profiles.json");
}

function readPersonaPrompt(runtime: OpenclawRuntimeConfig) {
  const promptPath = runtime.assistant?.personaPromptFile?.trim() || "openclaw/buildwise-assistant.persona.md";
  const absPath = resolve(process.cwd(), promptPath);
  if (!existsSync(absPath)) {
    return "";
  }
  try {
    return readFileSync(absPath, "utf-8").trim();
  } catch {
    return "";
  }
}

function readSkillsChainBrief() {
  const chainPath = resolve(process.cwd(), "skills", "buildwise-openclaw", "skill-chain.json");
  if (!existsSync(chainPath)) {
    return "";
  }
  try {
    const parsed = JSON.parse(readFileSync(chainPath, "utf-8")) as { sequence?: unknown };
    const sequence = Array.isArray(parsed.sequence) ? parsed.sequence.map((item) => String(item).trim()).filter(Boolean) : [];
    if (sequence.length === 0) return "";
    return `skills链路：${sequence.join(" -> ")}`;
  } catch {
    return "";
  }
}

function composeOpenclawPrompt(params: {
  personaPrompt: string;
  skillsChainBrief: string;
  userMessage: string;
  workspacePath?: string;
}) {
  const sections: string[] = [];
  if (params.personaPrompt) {
    sections.push(params.personaPrompt);
  }
  if (params.skillsChainBrief) {
    sections.push(`当前编排模式：openclaw + skills（单Agent）\n${params.skillsChainBrief}`);
  }
  if (params.workspacePath && params.workspacePath.trim()) {
    sections.push(`当前工作区路径：${params.workspacePath.trim()}`);
  }
  sections.push(`用户消息：${params.userMessage.trim()}`);
  return sections.join("\n\n");
}

export function openclawDirectChatOp(
  repo: WorkspaceRepository,
  input: { projectId: number; message: string }
): OpenclawDirectChatResult {
  const message = input.message.trim();
  if (!message) {
    throw new Error("message is required");
  }

  const binding = repo.listProjectWorkspaceBindings(input.projectId)[0] || null;
  if (!binding) {
    throw new Error("project workspace binding not found");
  }

  const runtime = readRuntimeConfig();
  const personaPrompt = readPersonaPrompt(runtime);
  const skillsChainBrief = readSkillsChainBrief();
  const runtimePaths = resolveRuntimePaths(runtime);
  const openclawRoot = runtimePaths.openclawRoot;
  const openclawEntry = runtimePaths.openclawEntry;
  const profile = binding.openclawProfile || runtimePaths.profile;
  const agentId = binding.agentId || runtimePaths.agentId;

  if (!openclawRoot || !existsSync(openclawEntry)) {
    throw new Error(`openclaw entry missing: ${openclawEntry}`);
  }
  if (!runtimePaths.openclawHomeWritable) {
    throw new Error(`openclaw home not writable: ${runtimePaths.openclawHome}`);
  }

  const prompt = composeOpenclawPrompt({
    personaPrompt,
    skillsChainBrief,
    userMessage: message,
    workspacePath: binding.workspacePath
  });

  const reply = runOpenclawCommand(runtimePaths, [openclawEntry, "--profile", profile, "agent", "--local", "--agent", agentId, "-m", prompt]);

  if (!reply) {
    throw new Error("openclaw returned empty response");
  }

  return {
    mode: "openclaw-native",
    profile,
    agentId,
    workspacePath: binding.workspacePath,
    reply,
    at: new Date().toISOString()
  };
}

export function openclawDirectChatGlobalOp(input: { message: string }): OpenclawDirectChatResult {
  const message = input.message.trim();
  if (!message) {
    throw new Error("message is required");
  }
  const runtime = readRuntimeConfig();
  const personaPrompt = readPersonaPrompt(runtime);
  const skillsChainBrief = readSkillsChainBrief();
  const runtimePaths = resolveRuntimePaths(runtime);
  const openclawRoot = runtimePaths.openclawRoot;
  const openclawEntry = runtimePaths.openclawEntry;
  const profile = runtimePaths.profile;
  const agentId = runtimePaths.agentId;
  if (!openclawRoot || !existsSync(openclawEntry)) {
    throw new Error(`openclaw entry missing: ${openclawEntry}`);
  }
  if (!runtimePaths.openclawHomeWritable) {
    throw new Error(`openclaw home not writable: ${runtimePaths.openclawHome}`);
  }
  const prompt = composeOpenclawPrompt({
    personaPrompt,
    skillsChainBrief,
    userMessage: message
  });

  const reply = runOpenclawCommand(runtimePaths, [openclawEntry, "--profile", profile, "agent", "--local", "--agent", agentId, "-m", prompt]);
  if (!reply) {
    throw new Error("openclaw returned empty response");
  }
  return {
    mode: "openclaw-native",
    profile,
    agentId,
    workspacePath: "",
    reply,
    at: new Date().toISOString()
  };
}

export function probeOpenclawIntegrationOp(): OpenclawIntegrationStatus {
  const runtime = readRuntimeConfig();
  const runtimeConfigFound = existsSync(runtimeConfigPath());
  const runtimePaths = resolveRuntimePaths(runtime);
  const openclawEntryExists = runtimePaths.openclawRoot ? existsSync(runtimePaths.openclawEntry) : false;
  const fallbackAuthPath = authProfilePath(runtimePaths.profile, runtimePaths.agentId, runtimePaths.openclawHome);
  let authConfigured = false;
  let authSource = "";
  let modelStatusChecked = false;
  if (runtimeConfigFound && runtimePaths.openclawRoot && openclawEntryExists) {
    try {
      const raw = runOpenclawCommand(runtimePaths, [
        runtimePaths.openclawEntry,
        "--profile",
        runtimePaths.profile,
        "models",
        "status",
        "--agent",
        runtimePaths.agentId,
        "--json"
      ]);
      const parsed = JSON.parse(raw) as {
        auth?: {
          missingProvidersInUse?: unknown[];
          providers?: Array<{ effective?: { kind?: string; detail?: string } }>;
          storePath?: string;
        };
      };
      const missing = Array.isArray(parsed.auth?.missingProvidersInUse) ? parsed.auth?.missingProvidersInUse : [];
      authConfigured = missing.length === 0;
      const firstProvider = Array.isArray(parsed.auth?.providers) ? parsed.auth?.providers[0] : null;
      authSource = firstProvider?.effective?.kind || "";
      modelStatusChecked = true;
      if (typeof parsed.auth?.storePath === "string" && parsed.auth.storePath.trim()) {
        // Prefer runtime-reported path for better accuracy across profile layouts.
        authSource = authSource ? `${authSource} (${parsed.auth.storePath})` : parsed.auth.storePath;
      }
    } catch {
      authConfigured = existsSync(fallbackAuthPath);
      modelStatusChecked = false;
      authSource = "";
    }
  } else {
    authConfigured = existsSync(fallbackAuthPath);
  }
  const integrated =
    runtimeConfigFound &&
    Boolean(runtimePaths.openclawRoot) &&
    openclawEntryExists &&
    runtimePaths.openclawHomeWritable &&
    authConfigured;
  const reason = integrated
    ? "ok"
    : !runtimeConfigFound
      ? "runtime config missing"
      : !runtimePaths.openclawRoot
        ? "openclaw.sourcePath missing"
        : !openclawEntryExists
          ? "openclaw entry missing"
          : !runtimePaths.openclawHomeWritable
            ? "openclaw home not writable"
            : "openclaw auth missing";
  return {
    runtimeConfigFound,
    openclawRoot: runtimePaths.openclawRoot,
    openclawEntry: runtimePaths.openclawEntry,
    openclawEntryExists,
    profile: runtimePaths.profile,
    agentId: runtimePaths.agentId,
    openclawHome: runtimePaths.openclawHome,
    openclawHomeWritable: runtimePaths.openclawHomeWritable,
    authProfilePath: fallbackAuthPath,
    authConfigured,
    modelStatusChecked,
    modelAuthSource: authSource,
    integrated,
    reason
  };
}
