import { existsSync, readFileSync, writeFileSync } from "node:fs";
import type { ContinuousModelingRepository } from "../../domain/continuousModeling/repository";
import type { ModelSnapshot, SnapshotStatus } from "../../domain/continuousModeling/types";

type ContinuousModelingStore = {
  snapshots: ModelSnapshot[];
};

function asSnapshots(value: unknown) {
  return Array.isArray(value) ? (value as ModelSnapshot[]) : [];
}

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
    const parsed = JSON.parse(raw) as Partial<ContinuousModelingStore>;
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
      writeFileSync(this.dataFile, JSON.stringify(data, null, 2), "utf-8");
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
