import type { IterationStatus } from "./iterationTypes";

/** Domain-level iteration status transition rules */
export const iterationStatusTransitions: Record<IterationStatus, IterationStatus[]> = {
  planned: ["in-progress", "blocked"],
  "in-progress": ["review", "blocked", "completed"],
  review: ["in-progress", "completed", "blocked"],
  blocked: ["in-progress", "review"],
  completed: []
};

export function canTransitionTo(from: IterationStatus, to: IterationStatus): boolean {
  return (iterationStatusTransitions[from] || []).includes(to);
}

export function allowedTransitionsFrom(status: IterationStatus): IterationStatus[] {
  return iterationStatusTransitions[status] || [];
}

export function suggestNextTransition(status: IterationStatus): IterationStatus | null {
  const transitions = iterationStatusTransitions[status];
  if (!transitions || transitions.length === 0) {
    return null;
  }
  // Default progression: planned→in-progress→review→completed
  const preferredOrder: IterationStatus[] = ["in-progress", "review", "completed"];
  for (const preferred of preferredOrder) {
    if (transitions.includes(preferred)) {
      return preferred;
    }
  }
  return transitions[0];
}
