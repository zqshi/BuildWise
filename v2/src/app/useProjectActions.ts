import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { IterationVersionType } from "../domain/workspace/iterationTypes";
import type { Project } from "../domain/workspace/types";
import type { UploadedAttachmentMeta } from "../domain/workspace/analysisTypes";
import { createIteration, createProject, deleteProject } from "./workspaceApi";
import { splitLines } from "./workspaceHelpers";

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

export function useProjectActions({
  currentProject,
  projectName,
  projectDesc,
  iterName,
  iterDesc,
  iterGoals,
  iterInScope,
  iterOutScope,
  iterAcceptance,
  iterVersionType,
  setBusy,
  setError,
  setCurrentProjectId,
  setCurrentIterationId,
  setProjectPanelMode,
  setShowCreateProject,
  setShowCreateIteration,
  setUploadedFile,
  setProjectName,
  setProjectDesc,
  setIterName,
  setIterDesc,
  setIterGoals,
  setIterInScope,
  setIterOutScope,
  setIterAcceptance,
  setIterVersionType,
  loadProjects,
  loadIterations
}: UseProjectActionsParams) {
  const resolveProjectApiError = (error: unknown) => {
    const raw = error instanceof Error ? error.message : "Unknown error";
    if (raw.includes("API error: network unavailable")) {
      return "后端服务不可达（127.0.0.1:5055）。请先启动后端：npm --prefix v2/backend run dev";
    }
    if (raw.includes("API error: request timeout")) {
      return "请求后端超时，请检查后端服务状态后重试。";
    }
    return raw;
  };

  const handleCreateProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!projectName.trim()) {
      return;
    }
    try {
      setBusy(true);
      const created = await createProject({
        name: projectName.trim(),
        description: projectDesc.trim() || "暂无描述"
      });
      await loadProjects();
      setCurrentProjectId(created.id);
      setProjectPanelMode("project");
      setShowCreateProject(false);
      setProjectName("");
      setProjectDesc("");
    } catch (err) {
      setError(resolveProjectApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateIteration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!currentProject) {
      return;
    }
    if (!iterName.trim()) {
      return;
    }

    const goals = splitLines(iterGoals);
    const inScope = splitLines(iterInScope);
    const outOfScope = splitLines(iterOutScope);
    const acceptanceCriteria = splitLines(iterAcceptance);

    try {
      setBusy(true);
      const created = await createIteration(currentProject.id, {
        name: iterName.trim(),
        description: iterDesc.trim() || "暂无描述",
        versionType: iterVersionType,
        goals,
        scope: {
          inScope,
          outOfScope,
          acceptanceCriteria
        },
        aiSummary: `基于${currentProject.name}，${iterName.trim()}聚焦${iterDesc.trim() || "本轮目标交付"}。`
      });
      await loadIterations(currentProject.id);
      setCurrentIterationId(created.id);
      setUploadedFile(null);
      setShowCreateIteration(false);
      setIterName("");
      setIterDesc("");
      setIterGoals("");
      setIterInScope("");
      setIterOutScope("");
      setIterAcceptance("");
      setIterVersionType("patch");
    } catch (err) {
      setError(resolveProjectApiError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleEnterIteration = (iterationId: number) => {
    setCurrentIterationId(iterationId);
    setProjectPanelMode("iteration");
  };

  const handleSelectProject = (projectId: number) => {
    setCurrentProjectId(projectId);
    setUploadedFile(null);
    setProjectPanelMode("project");
  };

  const handleDeleteProject = async (projectId: number) => {
    try {
      setBusy(true);
      await deleteProject(projectId);
      const remaining = await loadProjects();
      const stillExists = remaining.some((item) => item.id === projectId);
      if (stillExists) {
        throw new Error("项目删除未生效：请检查后端服务是否已更新到最新版本。");
      }
      setCurrentIterationId(null);
      setUploadedFile(null);
      setProjectPanelMode("project");
      if (remaining.length === 0) {
        setCurrentProjectId(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (/^API error: 404\b/.test(message)) {
        setError("删除接口不可用（404）。请重启后端服务后重试。");
      } else if (message.includes("API error: network unavailable")) {
        setError("后端服务不可达（127.0.0.1:5055）。请先启动后端：npm --prefix v2/backend run dev");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  return {
    handleCreateProject,
    handleCreateIteration,
    handleEnterIteration,
    handleSelectProject,
    handleDeleteProject
  };
}
