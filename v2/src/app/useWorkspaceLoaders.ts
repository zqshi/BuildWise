import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  AssessmentPayload,
  AssessmentSnapshot,
  Iteration,
  IterationContextPayload,
  IterationMessage,
  ModelRelationPayload,
  ModelSummaryPayload,
  RoadmapPayload,
  Project,
  RuleBindPayload,
  RuleCompilePayload,
  StatusPayload,
  SyncReportPayload,
  TracePayload
} from "../domain/workspace/types";
import { fetchJSON } from "../infrastructure/http/fetchJSON";
import { fetchIterationDetail, fetchModelOps, fetchProjectIterations, fetchProjects } from "./workspaceApi";
import { nowIsoString } from "./workspaceHelpers";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:5055";

type UseWorkspaceLoadersParams = {
  currentProjectId: number | null;
  setStatus: Dispatch<SetStateAction<StatusPayload | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setProjects: Dispatch<SetStateAction<Project[]>>;
  setCurrentProjectId: Dispatch<SetStateAction<number | null>>;
  setIterations: Dispatch<SetStateAction<Iteration[]>>;
  setCurrentIterationId: Dispatch<SetStateAction<number | null>>;
  setChatMessages: Dispatch<SetStateAction<IterationMessage[]>>;
  setContextData: Dispatch<SetStateAction<IterationContextPayload | null>>;
  setAssessmentData: Dispatch<SetStateAction<AssessmentPayload | null>>;
  setAssessmentHistory: Dispatch<SetStateAction<AssessmentSnapshot[]>>;
  setModelSummary: Dispatch<SetStateAction<ModelSummaryPayload | null>>;
  setModelRelations: Dispatch<SetStateAction<ModelRelationPayload[]>>;
  setRuleCompile: Dispatch<SetStateAction<RuleCompilePayload | null>>;
  setRuleBind: Dispatch<SetStateAction<RuleBindPayload | null>>;
  setSyncReport: Dispatch<SetStateAction<SyncReportPayload | null>>;
  setTraceReport: Dispatch<SetStateAction<TracePayload | null>>;
  setRoadmapReports: Dispatch<SetStateAction<RoadmapPayload[]>>;
  setModelOpsLoading: Dispatch<SetStateAction<boolean>>;
};

export function useWorkspaceLoaders({
  currentProjectId,
  setStatus,
  setError,
  setProjects,
  setCurrentProjectId,
  setIterations,
  setCurrentIterationId,
  setChatMessages,
  setContextData,
  setAssessmentData,
  setAssessmentHistory,
  setModelSummary,
  setModelRelations,
  setRuleCompile,
  setRuleBind,
  setSyncReport,
  setTraceReport,
  setRoadmapReports,
  setModelOpsLoading
}: UseWorkspaceLoadersParams) {
  const loadProjects = async () => {
    const projectData = await fetchProjects();
    setProjects(projectData);
    if (!currentProjectId && projectData.length > 0) {
      setCurrentProjectId(projectData[0].id);
    }
    return projectData;
  };

  const loadIterations = async (projectId: number) => {
    const data = await fetchProjectIterations(projectId);
    setIterations(data);
    if (data.length === 0) {
      setCurrentIterationId(null);
      return;
    }
    const current = data.find((item) => item.current) ?? data[data.length - 1];
    setCurrentIterationId(current.id);
  };

  const loadIterationDetail = async (iterationId: number) => {
    const { messages, context, assessment, history } = await fetchIterationDetail(iterationId);
    if (messages.length === 0) {
      const firstMessage: IterationMessage = {
        id: -1,
        iterationId,
        role: "assistant",
        content: "请围绕当前迭代范围沟通需求，输入“开始拆解任务”可生成本迭代执行清单。",
        createdAt: nowIsoString()
      };
      setChatMessages([firstMessage]);
    } else {
      setChatMessages(messages);
    }
    setContextData(context);
    setAssessmentData(assessment);
    setAssessmentHistory(history);
  };

  const loadModelOps = async () => {
    try {
      setModelOpsLoading(true);
      const reports = await fetchModelOps();
      setModelSummary(reports.modelSummary);
      setModelRelations(reports.modelRelations);
      setRuleCompile(reports.ruleCompile);
      setRuleBind(reports.ruleBind);
      setSyncReport(reports.syncReport);
      setTraceReport(reports.traceReport);
      setRoadmapReports(reports.roadmapReports);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setModelOpsLoading(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const statusData = await fetchJSON<StatusPayload>(`${API_BASE}/api/status`);
        setStatus(statusData);
        await Promise.all([loadProjects(), loadModelOps()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    };
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { loadProjects, loadIterations, loadIterationDetail, loadModelOps };
}
