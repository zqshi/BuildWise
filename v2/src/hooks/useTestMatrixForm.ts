import { useEffect, useState } from "react";
import type { Iteration } from "../pages/projects/iterationWorkspacePanelTypes";

export function useTestMatrixForm(currentIteration: Iteration | null) {
  const [testMatrixStatusMap, setTestMatrixStatusMap] = useState<Record<string, "pending" | "passed" | "failed" | "blocked" | "skipped">>({});
  const [testMatrixNoteMap, setTestMatrixNoteMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const matrix = currentIteration?.changeControl?.generatedTestMatrix ?? [];
    const nextStatusMap: Record<string, "pending" | "passed" | "failed" | "blocked" | "skipped"> = {};
    const nextNoteMap: Record<string, string> = {};
    for (const item of matrix) {
      nextStatusMap[item.caseId] = item.executionStatus;
      nextNoteMap[item.caseId] = item.executionNote || "";
    }
    setTestMatrixStatusMap(nextStatusMap);
    setTestMatrixNoteMap(nextNoteMap);
  }, [currentIteration?.id, currentIteration?.changeControl?.generatedTestMatrixUpdatedAt, currentIteration?.changeControl?.testMatrixExecutionUpdatedAt]);

  return {
    testMatrixStatusMap, setTestMatrixStatusMap,
    testMatrixNoteMap, setTestMatrixNoteMap,
  };
}
