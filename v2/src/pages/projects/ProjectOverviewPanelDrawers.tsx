import { ProjectOverviewPanelGovernanceDrawers } from "./ProjectOverviewPanelGovernanceDrawers";
import { ProjectOverviewPanelRepositoryDrawer } from "./ProjectOverviewPanelRepositoryDrawer";
import type {
  ProjectOverviewGovernanceDrawersProps,
  ProjectOverviewRepositoryDrawerProps
} from "./projectOverviewPanelDrawerTypes";

type Props = ProjectOverviewGovernanceDrawersProps & ProjectOverviewRepositoryDrawerProps;

export function ProjectOverviewPanelDrawers(props: Props) {
  return (
    <>
      <ProjectOverviewPanelGovernanceDrawers {...props} />
      <ProjectOverviewPanelRepositoryDrawer {...props} />
    </>
  );
}
