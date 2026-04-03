import { useEffect } from "react";

type UseGovernanceEntryParams = {
  currentProjectId: number | undefined;
  setShowPolicyDrawer: (show: boolean) => void;
  setShowAssistantDrawer: (show: boolean) => void;
};

export function useGovernanceEntry({
  currentProjectId,
  setShowPolicyDrawer,
  setShowAssistantDrawer
}: UseGovernanceEntryParams) {
  useEffect(() => {
    const consumeEntry = () => {
      if (!currentProjectId) return;
      let pendingEntry: string | null = null;
      try {
        pendingEntry = localStorage.getItem("buildwise:project-governance-entry");
        if (pendingEntry) {
          localStorage.removeItem("buildwise:project-governance-entry");
        }
      } catch {
        pendingEntry = null;
      }
      if (pendingEntry === "policy") {
        setShowPolicyDrawer(true);
        return;
      }
      if (pendingEntry === "assistant") {
        setShowAssistantDrawer(true);
      }
    };
    consumeEntry();
    const onOpenRequest = () => consumeEntry();
    window.addEventListener("buildwise:open-governance", onOpenRequest);
    return () => window.removeEventListener("buildwise:open-governance", onOpenRequest);
  }, [currentProjectId]);
}
