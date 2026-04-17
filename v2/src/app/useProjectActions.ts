import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { IterationVersionType } from "../domain/workspace/iterationTypes";
import type { Project } from "../domain/workspace/types";
import type { UploadedAttachmentMeta } from "../domain/workspace/analysisTypes";
import { createIteration, createProject, deleteProject, deleteIteration } from "./workspaceApi";
import { splitLines } from "./workspaceHelpers";
import { resolveErrorMessage } from "../shared/resolveErrorMessage";

type UseProjectActionsParams = {
  currentProject: Project | null;
  projectName: string;
  projectDesc: string;
  iterName: string;
  iterDesc: string;
  iterGoals: string;
  iterInScope: string;
  iterOutScope: string;
  iterAcceptance: string;
  iterVersionType: IterationVersionType;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setCurrentProjectId: Dispatch<SetStateAction<number | null>>;
  setCurrentIterationId: Dispatch<SetStateAction<number | null>>;
  setProjectPanelMode: Dispatch<SetStateAction<"project" | "iteration">>;
  setShowCreateProject: Dispatch<SetStateAction<boolean>>;
  setShowCreateIteration: Dispatch<SetStateAction<boolean>>;
  setUploadedFile: Dispatch<SetStateAction<UploadedAttachmentMeta | null>>;
  setProjectName: Dispatch<SetStateAction<string>>;
  setProjectDesc: Dispatch<SetStateAction<string>>;
  setIterName: Dispatch<SetStateAction<string>>;
  setIterDesc: Dispatch<SetStateAction<string>>;
  setIterGoals: Dispatch<SetStateAction<string>>;
  setIterInScope: Dispatch<SetStateAction<string>>;
  setIterOutScope: Dispatch<SetStateAction<string>>;
  setIterAcceptance: Dispatch<SetStateAction<string>>;
  setIterVersionType: Dispatch<SetStateAction<IterationVersionType>>;
  loadProjects: () => Promise<Project[]>;
  loadIterations: (projectId: number) => Promise<void>;
};

/* ── module-level helper (no hook state needed) ── */

function resolveProjectApiError(error: unknown): string {
  const raw = resolveErrorMessage(error);
  if (raw.includes("API error: network unavailable")) {
    return "后端服务不可达（127.0.0.1:5055）。请先启动后端：npm --prefix v2/backend run dev";
  }
  if (raw.includes("API error: request timeout")) {
    return "请求后端超时，请检查后端服务状态后重试。";
  }
  return raw;
}

/* ── creation sub-hook ── */

type CreationParams = Pick<
  UseProjectActionsParams,
  | "currentProject" | "projectName" | "projectDesc"
  | "iterName" | "iterDesc" | "iterGoals" | "iterInScope"
  | "iterOutScope" | "iterAcceptance" | "iterVersionType"
  | "setBusy" | "setError" | "setCurrentProjectId" | "setCurrentIterationId"
  | "setProjectPanelMode" | "setShowCreateProject" | "setShowCreateIteration"
  | "setUploadedFile" | "setProjectName" | "setProjectDesc"
  | "setIterName" | "setIterDesc" | "setIterGoals" | "setIterInScope"
  | "setIterOutScope" | "setIterAcceptance" | "setIterVersionType"
  | "loadProjects" | "loadIterations"
>;

function resetIterationForm(p: CreationParams) {
  p.setIterName("");
  p.setIterDesc("");
  p.setIterGoals("");
  p.setIterInScope("");
  p.setIterOutScope("");
  p.setIterAcceptance("");
  p.setIterVersionType("patch");
}

function buildIterationPayload(p: CreationParams) {
  return {
    name: p.iterName.trim(),
    description: p.iterDesc.trim() || "暂无描述",
    versionType: p.iterVersionType,
    goals: splitLines(p.iterGoals),
    scope: {
      inScope: splitLines(p.iterInScope),
      outOfScope: splitLines(p.iterOutScope),
      acceptanceCriteria: splitLines(p.iterAcceptance),
    },
    aiSummary: `基于${p.currentProject!.name}，${p.iterName.trim()}聚焦${p.iterDesc.trim() || "本轮目标交付"}。`,
  };
}

function useProjectCreation(p: CreationParams) {
  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!p.projectName.trim()) return;
    try {
      p.setBusy(true);
      const created = await createProject({
        name: p.projectName.trim(),
        description: p.projectDesc.trim() || "暂无描述"
      });
      await p.loadProjects();
      p.setCurrentProjectId(created.id);
      p.setProjectPanelMode("project");
      p.setShowCreateProject(false);
      p.setProjectName("");
      p.setProjectDesc("");
    } catch (err) {
      p.setError(resolveProjectApiError(err));
    } finally {
      p.setBusy(false);
    }
  };

  const handleCreateIteration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!p.currentProject || !p.iterName.trim()) return;
    try {
      p.setBusy(true);
      const created = await createIteration(p.currentProject.id, buildIterationPayload(p));
      await p.loadIterations(p.currentProject.id);
      p.setCurrentIterationId(created.id);
      p.setUploadedFile(null);
      p.setShowCreateIteration(false);
      resetIterationForm(p);
    } catch (err) {
      p.setError(resolveProjectApiError(err));
    } finally {
      p.setBusy(false);
    }
  };

  return { handleCreateProject, handleCreateIteration };
}

/* ── deletion sub-hook ── */

type DeletionParams = Pick<
  UseProjectActionsParams,
  | "currentProject"
  | "setBusy" | "setError" | "setCurrentProjectId" | "setCurrentIterationId"
  | "setProjectPanelMode" | "setUploadedFile"
  | "loadProjects" | "loadIterations"
>;

function useProjectDeletion(p: DeletionParams) {
  const handleDeleteProject = async (projectId: number) => {
    try {
      p.setBusy(true);
      await deleteProject(projectId);
      const remaining = await p.loadProjects();
      const stillExists = remaining.some((item) => item.id === projectId);
      if (stillExists) {
        throw new Error("项目删除未生效：请检查后端服务是否已更新到最新版本。");
      }
      p.setCurrentIterationId(null);
      p.setUploadedFile(null);
      p.setProjectPanelMode("project");
      if (remaining.length === 0) {
        p.setCurrentProjectId(null);
      }
    } catch (err) {
      const message = resolveErrorMessage(err);
      if (/^API error: 404\b/.test(message)) {
        p.setError("删除接口不可用（404）。请重启后端服务后重试。");
      } else if (message.includes("API error: network unavailable")) {
        p.setError("后端服务不可达（127.0.0.1:5055）。请先启动后端：npm --prefix v2/backend run dev");
      } else {
        p.setError(message);
      }
    } finally {
      p.setBusy(false);
    }
  };

  const handleDeleteIteration = async (iterationId: number) => {
    if (!p.currentProject) return;
    try {
      p.setBusy(true);
      await deleteIteration(p.currentProject.id, iterationId);
      await p.loadIterations(p.currentProject.id);
      if (iterationId === p.currentProject.id) {
        p.setCurrentIterationId(null);
      }
    } catch (err) {
      const message = resolveErrorMessage(err);
      if (message.includes("409") || message.includes("iteration_has_data")) {
        alert("该版本已产生迭代数据，不可删除");
      } else {
        p.setError(message);
      }
    } finally {
      p.setBusy(false);
    }
  };

  return { handleDeleteProject, handleDeleteIteration };
}

/* ── main hook (thin orchestrator) ── */

export function useProjectActions(params: UseProjectActionsParams) {
  const { handleCreateProject, handleCreateIteration } = useProjectCreation(params);
  const { handleDeleteProject, handleDeleteIteration } = useProjectDeletion(params);

  const handleEnterIteration = (iterationId: number) => {
    params.setCurrentIterationId(iterationId);
    params.setProjectPanelMode("iteration");
  };

  const handleSelectProject = (projectId: number) => {
    params.setCurrentProjectId(projectId);
    params.setUploadedFile(null);
    params.setProjectPanelMode("project");
  };

  return {
    handleCreateProject,
    handleCreateIteration,
    handleEnterIteration,
    handleSelectProject,
    handleDeleteProject,
    handleDeleteIteration
  };
}
