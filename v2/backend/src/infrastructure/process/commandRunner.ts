import {
  execFileSync as nodeExecFileSync,
  spawnSync as nodeSpawnSync,
  type SpawnSyncReturns,
  type SpawnSyncOptions,
  type ExecFileSyncOptions
} from "node:child_process";

export type SpawnSyncResult = SpawnSyncReturns<string>;

export interface CommandRunner {
  execFileSync(file: string, args: string[], options: ExecFileSyncOptions & { encoding: "utf-8" }): string;
  spawnSync(command: string, args: string[], options: SpawnSyncOptions & { encoding: "utf-8" }): SpawnSyncResult;
}

class DefaultCommandRunner implements CommandRunner {
  execFileSync(file: string, args: string[], options: ExecFileSyncOptions & { encoding: "utf-8" }): string {
    return nodeExecFileSync(file, args, options) as string;
  }

  spawnSync(command: string, args: string[], options: SpawnSyncOptions & { encoding: "utf-8" }): SpawnSyncResult {
    return nodeSpawnSync(command, args, options);
  }
}

const defaultInstance = new DefaultCommandRunner();

export function getCommandRunner(): CommandRunner {
  return defaultInstance;
}

