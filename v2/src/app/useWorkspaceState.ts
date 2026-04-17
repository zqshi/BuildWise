/**
 * Legacy facade: aggregates the 7 domain-specific contexts into the flat shape
 * that useAppController and other callsites still expect.
 *
 * No useState calls live here any more — every piece of state is owned by one
 * of the dedicated Context providers.
 *
 * Internally split into two sub-hooks for readability:
 *  - useWorkspaceCoreState: project / iteration / navigation / chat
 *  - useWorkspaceUIState:   analysis panel / platform / ops metrics
 */
import { useNavigationContext } from "../contexts/NavigationContext";
import { useProjectContext } from "../contexts/ProjectContext";
import { useIterationContext } from "../contexts/IterationContext";
import { useChatContext } from "../contexts/ChatContext";
import { useAnalysisContext } from "../contexts/AnalysisContext";
import { usePlatformContext } from "../contexts/PlatformContext";

/* ------------------------------------------------------------------ */
/*  Core: navigation + project + iteration + chat                     */
/* ------------------------------------------------------------------ */
function useWorkspaceCoreState() {
  const nav = useNavigationContext();
  const proj = useProjectContext();
  const iter = useIterationContext();
  const chat = useChatContext();

  return { ...nav, ...proj, ...iter, ...chat };
}

/* ------------------------------------------------------------------ */
/*  UI: analysis panel + platform services + ops metrics              */
/* ------------------------------------------------------------------ */
function useWorkspaceUIState() {
  const analysis = useAnalysisContext();
  const platform = usePlatformContext();

  return { ...analysis, ...platform };
}

/* ------------------------------------------------------------------ */
/*  Public facade — exact same return shape as before                 */
/* ------------------------------------------------------------------ */
export function useWorkspaceState() {
  const core = useWorkspaceCoreState();
  const ui = useWorkspaceUIState();

  return { ...core, ...ui };
}
