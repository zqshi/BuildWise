import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from "react";
import type { Iteration } from "../domain/workspace/types";
import type { IterationVersionType } from "../domain/workspace/iterationTypes";
import { ensureArray } from "../shared/ensureArray";

function readStorageNumber(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

type IterationContextValue = {
  iterations: Iteration[];
  setIterations: React.Dispatch<React.SetStateAction<Iteration[]>>;
  currentIterationId: number | null;
  setCurrentIterationId: React.Dispatch<React.SetStateAction<number | null>>;
  currentIteration: Iteration | null;
  showCreateIteration: boolean;
  setShowCreateIteration: React.Dispatch<React.SetStateAction<boolean>>;
  iterName: string;
  setIterName: React.Dispatch<React.SetStateAction<string>>;
  iterDesc: string;
  setIterDesc: React.Dispatch<React.SetStateAction<string>>;
  iterGoals: string;
  setIterGoals: React.Dispatch<React.SetStateAction<string>>;
  iterInScope: string;
  setIterInScope: React.Dispatch<React.SetStateAction<string>>;
  iterOutScope: string;
  setIterOutScope: React.Dispatch<React.SetStateAction<string>>;
  iterAcceptance: string;
  setIterAcceptance: React.Dispatch<React.SetStateAction<string>>;
  iterVersionType: IterationVersionType;
  setIterVersionType: React.Dispatch<React.SetStateAction<IterationVersionType>>;
};

const IterationContext = createContext<IterationContextValue | null>(null);

export function IterationProvider({ children }: { children: ReactNode }) {
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [currentIterationId, setCurrentIterationId] = useState<number | null>(
    () => readStorageNumber("buildwise:current-iteration-id")
  );
  const [showCreateIteration, setShowCreateIteration] = useState(false);
  const [iterName, setIterName] = useState("");
  const [iterDesc, setIterDesc] = useState("");
  const [iterGoals, setIterGoals] = useState("");
  const [iterInScope, setIterInScope] = useState("");
  const [iterOutScope, setIterOutScope] = useState("");
  const [iterAcceptance, setIterAcceptance] = useState("");
  const [iterVersionType, setIterVersionType] = useState<IterationVersionType>("patch");

  const currentIteration = useMemo(
    () => ensureArray<Iteration>(iterations).find((item) => item.id === currentIterationId) ?? null,
    [iterations, currentIterationId]
  );

  useEffect(() => {
    try {
      if (currentIterationId) {
        localStorage.setItem("buildwise:current-iteration-id", String(currentIterationId));
      } else {
        localStorage.removeItem("buildwise:current-iteration-id");
      }
    } catch {
      // ignore storage failure
    }
  }, [currentIterationId]);

  const value = useMemo(
    () => ({
      iterations,
      setIterations,
      currentIterationId,
      setCurrentIterationId,
      currentIteration,
      showCreateIteration,
      setShowCreateIteration,
      iterName,
      setIterName,
      iterDesc,
      setIterDesc,
      iterGoals,
      setIterGoals,
      iterInScope,
      setIterInScope,
      iterOutScope,
      setIterOutScope,
      iterAcceptance,
      setIterAcceptance,
      iterVersionType,
      setIterVersionType,
    }),
    [
      iterations,
      currentIterationId,
      currentIteration,
      showCreateIteration,
      iterName,
      iterDesc,
      iterGoals,
      iterInScope,
      iterOutScope,
      iterAcceptance,
      iterVersionType,
    ]
  );

  return <IterationContext.Provider value={value}>{children}</IterationContext.Provider>;
}

export function useIterationContext() {
  const ctx = useContext(IterationContext);
  if (!ctx) throw new Error("Missing IterationProvider");
  return ctx;
}
