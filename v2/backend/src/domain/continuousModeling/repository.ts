import type { ModelSnapshot } from "./types";

export interface ContinuousModelingRepository {
  listSnapshots(projectId: number): ModelSnapshot[];
  getLatestPublishedSnapshot(projectId: number): ModelSnapshot | null;
  saveCandidateSnapshot(snapshot: ModelSnapshot): void;
}
