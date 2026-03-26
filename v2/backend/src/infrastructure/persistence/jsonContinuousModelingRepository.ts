import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createLogger } from "../runtime/logger";
const log = createLogger("continuous-modeling-repo");
import type { ContinuousModelingRepository } from "../../domain/continuousModeling/repository";
import type { ModelSnapshot, SnapshotStatus } from "../../domain/continuousModeling/types";

type ContinuousModelingStore = {
  snapshots: ModelSnapshot[];
};

function asSnapshots(value: unknown) {
  return Array.isArray(value) ? (value as ModelSnapshot[]) : [];
}

/**
 * JSON-file backed continuous modeling repository.
 *
 * CONCURRENCY SAFETY NOTE:
 * All read-modify-write sequences are fully synchronous (readFileSync →
 * in-memory mutation → writeFileSync) with no await points in between.
 * Node.js single-threaded execution guarantees atomicity within each
 * synchronous call, so no async mutex is needed for single-process deployments.
 *
 * If any method is refactored to use async I/O, an async mutex MUST be added.
 * The `writing` flag is a defensive assertion against accidental re-entrant writes.
 * For production, prefer STORAGE_BACKEND=sqlite for transactional safety.
 */
export class JsonContinuousModelingRepository implements ContinuousModelingRepository {
  private readonly dataFile: string;
  private writing = false;
  constructor(dataFile: string) {
    this.dataFile = dataFile;
  }

  private readStore(): ContinuousModelingStore {
    if (!existsSync(this.dataFile)) {
      const initial = { snapshots: [] };
      this.writeStore(initial);
      return initial;
    }
    const raw = readFileSync(this.dataFile, "utf-8");
    let parsed: Partial<ContinuousModelingStore>;
    try {
      parsed = JSON.parse(raw) as Partial<ContinuousModelingStore>;
    } catch {
      log.error("data file corrupted, resetting", { file: this.dataFile });
      const initial = { snapshots: [] as ModelSnapshot[] };
      this.writeStore(initial);
      return initial;
    }
    return {
      snapshots: asSnapshots(parsed.snapshots)
    };
  }

  private writeStore(data: ContinuousModelingStore) {
    if (this.writing) {
      throw new Error("Concurrent write detected on JsonContinuousModelingRepository");
    }
    this.writing = true;
    try {
      const tmpFile = `${this.dataFile}.tmp`;
      writeFileSync(tmpFile, JSON.stringify(data, null, 2), "utf-8");
      renameSync(tmpFile, this.dataFile);
    } finally {
      this.writing = false;
    }
  }

  listSnapshots(projectId: number) {
    return this.readStore().snapshots.filter((item) => item.projectId === projectId);
  }

  getLatestPublishedSnapshot(projectId: number) {
    return (
      this.listSnapshots(projectId)
        .filter((item) => item.status === "published")
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
    );
  }

  saveCandidateSnapshot(snapshot: ModelSnapshot) {
    const data = this.readStore();
    const remaining = data.snapshots.filter((item) => item.id !== snapshot.id);
    remaining.push(snapshot);
    data.snapshots = remaining.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    this.writeStore(data);
  }

  updateSnapshotStatus(snapshotId: string, status: SnapshotStatus) {
    const data = this.readStore();
    const target = data.snapshots.find((item) => item.id === snapshotId);
    if (!target) {
      return false;
    }
    target.status = status;
    this.writeStore(data);
    return true;
  }
}
