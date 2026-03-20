import { createContext, useContext, useState, useMemo, type ReactNode } from "react";
import type {
  ModelSummaryPayload,
  ModelRelationPayload,
  RuleCompilePayload,
  RuleBindPayload,
  SyncReportPayload,
  TracePayload,
  RoadmapPayload,
} from "../domain/workspace/types";
import type { OpsMetricsPayload } from "../domain/workspace/platformTypes";

type ModelOpsContextValue = {
  modelSummary: ModelSummaryPayload | null;
  setModelSummary: React.Dispatch<React.SetStateAction<ModelSummaryPayload | null>>;
  modelRelations: ModelRelationPayload[];
  setModelRelations: React.Dispatch<React.SetStateAction<ModelRelationPayload[]>>;
  ruleCompile: RuleCompilePayload | null;
  setRuleCompile: React.Dispatch<React.SetStateAction<RuleCompilePayload | null>>;
  ruleBind: RuleBindPayload | null;
  setRuleBind: React.Dispatch<React.SetStateAction<RuleBindPayload | null>>;
  syncReport: SyncReportPayload | null;
  setSyncReport: React.Dispatch<React.SetStateAction<SyncReportPayload | null>>;
  traceReport: TracePayload | null;
  setTraceReport: React.Dispatch<React.SetStateAction<TracePayload | null>>;
  roadmapReports: RoadmapPayload[];
  setRoadmapReports: React.Dispatch<React.SetStateAction<RoadmapPayload[]>>;
  modelOpsLoading: boolean;
  setModelOpsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  opsMetrics: OpsMetricsPayload | null;
  setOpsMetrics: React.Dispatch<React.SetStateAction<OpsMetricsPayload | null>>;
};

const ModelOpsContext = createContext<ModelOpsContextValue | null>(null);

export function ModelOpsProvider({ children }: { children: ReactNode }) {
  const [modelSummary, setModelSummary] = useState<ModelSummaryPayload | null>(null);
  const [modelRelations, setModelRelations] = useState<ModelRelationPayload[]>([]);
  const [ruleCompile, setRuleCompile] = useState<RuleCompilePayload | null>(null);
  const [ruleBind, setRuleBind] = useState<RuleBindPayload | null>(null);
  const [syncReport, setSyncReport] = useState<SyncReportPayload | null>(null);
  const [traceReport, setTraceReport] = useState<TracePayload | null>(null);
  const [roadmapReports, setRoadmapReports] = useState<RoadmapPayload[]>([]);
  const [modelOpsLoading, setModelOpsLoading] = useState(false);
  const [opsMetrics, setOpsMetrics] = useState<OpsMetricsPayload | null>(null);

  const value = useMemo(
    () => ({
      modelSummary,
      setModelSummary,
      modelRelations,
      setModelRelations,
      ruleCompile,
      setRuleCompile,
      ruleBind,
      setRuleBind,
      syncReport,
      setSyncReport,
      traceReport,
      setTraceReport,
      roadmapReports,
      setRoadmapReports,
      modelOpsLoading,
      setModelOpsLoading,
      opsMetrics,
      setOpsMetrics,
    }),
    [modelSummary, modelRelations, ruleCompile, ruleBind, syncReport, traceReport, roadmapReports, modelOpsLoading, opsMetrics]
  );

  return <ModelOpsContext.Provider value={value}>{children}</ModelOpsContext.Provider>;
}

export function useModelOpsContext() {
  const ctx = useContext(ModelOpsContext);
  if (!ctx) throw new Error("Missing ModelOpsProvider");
  return ctx;
}
