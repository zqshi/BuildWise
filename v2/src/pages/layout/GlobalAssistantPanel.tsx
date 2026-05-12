import { AssistantWorkbench } from "../assistant/AssistantWorkbench";

type GlobalAssistantPanelProps = {
  isAdmin: boolean;
  tenantId?: string;
  onBack: () => void;
};

export function GlobalAssistantPanel({ onBack, tenantId }: GlobalAssistantPanelProps) {
  return <AssistantWorkbench tenantId={tenantId || ""} onBack={onBack} />;
}
