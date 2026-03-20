import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from "react";
import type { Project } from "../domain/workspace/types";
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

type ProjectContextValue = {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  currentProjectId: number | null;
  setCurrentProjectId: React.Dispatch<React.SetStateAction<number | null>>;
  currentProject: Project | null;
  showCreateProject: boolean;
  setShowCreateProject: React.Dispatch<React.SetStateAction<boolean>>;
  projectName: string;
  setProjectName: React.Dispatch<React.SetStateAction<string>>;
  projectDesc: string;
  setProjectDesc: React.Dispatch<React.SetStateAction<string>>;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(
    () => readStorageNumber("buildwise:current-project-id")
  );
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectDesc, setProjectDesc] = useState("");

  const currentProject = useMemo(
    () => ensureArray<Project>(projects).find((item) => item.id === currentProjectId) ?? null,
    [projects, currentProjectId]
  );

  useEffect(() => {
    try {
      if (currentProjectId) {
        localStorage.setItem("buildwise:current-project-id", String(currentProjectId));
      } else {
        localStorage.removeItem("buildwise:current-project-id");
      }
    } catch {
      // ignore storage failure
    }
  }, [currentProjectId]);

  const value = useMemo(
    () => ({
      projects,
      setProjects,
      currentProjectId,
      setCurrentProjectId,
      currentProject,
      showCreateProject,
      setShowCreateProject,
      projectName,
      setProjectName,
      projectDesc,
      setProjectDesc,
    }),
    [projects, currentProjectId, currentProject, showCreateProject, projectName, projectDesc]
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProjectContext() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("Missing ProjectProvider");
  return ctx;
}
