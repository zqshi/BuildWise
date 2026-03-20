import { useEffect, useState } from "react";
import type { Iteration } from "../pages/projects/iterationWorkspacePanelTypes";

export function useChangeControlForm(currentIteration: Iteration | null) {
  const [resolvedQuestions, setResolvedQuestions] = useState<string[]>([]);
  const [boundaryRequirementRefsText, setBoundaryRequirementRefsText] = useState("");
  const [boundaryComponentRefsText, setBoundaryComponentRefsText] = useState("");
  const [boundaryCodePathsText, setBoundaryCodePathsText] = useState("");
  const [boundaryNote, setBoundaryNote] = useState("");
  const [confirmNote, setConfirmNote] = useState("");
  const [changeControlBusy, setChangeControlBusy] = useState(false);
  const [changeControlNotice, setChangeControlNotice] = useState("");

  useEffect(() => {
    const boundary = currentIteration?.changeControl?.boundary;
    setResolvedQuestions(currentIteration?.changeControl?.clarificationDraftResolvedQuestions ?? []);
    setBoundaryRequirementRefsText((boundary?.requirementRefs ?? []).join("\n"));
    setBoundaryComponentRefsText((boundary?.componentRefs ?? []).join("\n"));
    setBoundaryCodePathsText((boundary?.codePaths ?? []).join("\n"));
    setBoundaryNote(boundary?.note ?? "");
    setConfirmNote(currentIteration?.changeControl?.lastClarificationNote ?? "");
  }, [currentIteration?.id, currentIteration?.changeControl?.boundary?.updatedAt, currentIteration?.changeControl?.clarificationDraftUpdatedAt]);

  return {
    resolvedQuestions, setResolvedQuestions,
    boundaryRequirementRefsText, setBoundaryRequirementRefsText,
    boundaryComponentRefsText, setBoundaryComponentRefsText,
    boundaryCodePathsText, setBoundaryCodePathsText,
    boundaryNote, setBoundaryNote,
    confirmNote, setConfirmNote,
    changeControlBusy, setChangeControlBusy,
    changeControlNotice, setChangeControlNotice,
  };
}
