import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { Project } from "../domain/workspace/types";
import { createIteration, createProject } from "./workspaceApi";
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
  setBusy: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setCurrentProjectId: Dispatch<SetStateAction<number | null>>;
  setCurrentIterationId: Dispatch<SetStateAction<number | null>>;
  setProjectPanelMode: Dispatch<SetStateAction<"project" | "iteration">>;
  setShowCreateProject: Dispatch<SetStateAction<boolean>>;
  setShowCreateIteration: Dispatch<SetStateAction<boolean>>;
  setUploadedFile: Dispatch<SetStateAction<{ name: string; iterationId: number } | null>>;
  setProjectName: Dispatch<SetStateAction<string>>;
  setProjectDesc: Dispatch<SetStateAction<string>>;
  setIterName: Dispatch<SetStateAction<string>>;
  setIterDesc: Dispatch<SetStateAction<string>>;
  setIterGoals: Dispatch<SetStateAction<string>>;
  setIterInScope: Dispatch<SetStateAction<string>>;
  setIterOutScope: Dispatch<SetStateAction<string>>;
  setIterAcceptance: Dispatch<SetStateAction<string>>;
  loadProjects: () => Promise<unknown>;
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
  loadProjects,
  loadIterations
}: UseProjectActionsParams) {
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
      setError(err instanceof Error ? err.message : "Unknown error");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
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

  return {
    handleCreateProject,
    handleCreateIteration,
    handleEnterIteration,
    handleSelectProject
  };
}
