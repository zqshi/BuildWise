import { useEffect } from "react";

type UseGovernanceEntryParams = {
  currentProjectId: number | undefined;
  setShowPolicyDrawer: (show: boolean) => void;
  setShowOpenclawDrawer: (show: boolean) => void;
};

export function useGovernanceEntry({
  currentProjectId,
  setShowPolicyDrawer,
  setShowOpenclawDrawer
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
      if (pendingEntry === "openclaw") {
        setShowOpenclawDrawer(true);
      }
    };
    consumeEntry();
    const onOpenRequest = () => consumeEntry();
    window.addEventListener("buildwise:open-governance", onOpenRequest);
    return () => window.removeEventListener("buildwise:open-governance", onOpenRequest);
  }, [currentProjectId]);
}
