/**
 * ProjectsWorkspaceConnector — ProjectsWorkspace 的稳定调用入口（壳层）。
 *
 * 重构后 ProjectsWorkspace 通过 AppControllerContext 自取全部状态/回调，
 * 本组件不再做 prop 透传，仅保留为 MainContentArea 的稳定渲染入口。
 */
import { ProjectsWorkspace } from "../pages/projects/ProjectsWorkspace";

export function ProjectsWorkspaceConnector() {
  return <ProjectsWorkspace />;
}
