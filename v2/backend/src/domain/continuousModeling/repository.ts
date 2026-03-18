import type { ModelSnapshot, SnapshotStatus } from "./types";

export interface ContinuousModelingRepository {
  listSnapshots(projectId: number): ModelSnapshot[];
  getLatestPublishedSnapshot(projectId: number): ModelSnapshot | null;
  saveCandidateSnapshot(snapshot: ModelSnapshot): void;
  updateSnapshotStatus(snapshotId: string, status: SnapshotStatus): boolean;
}
