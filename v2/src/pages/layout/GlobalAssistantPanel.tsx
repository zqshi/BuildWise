import { AssistantWorkbench } from "../assistant/AssistantWorkbench";

type GlobalAssistantPanelProps = {
  isAdmin: boolean;
  onBack: () => void;
};

export function GlobalAssistantPanel({ onBack }: GlobalAssistantPanelProps) {
  return <AssistantWorkbench onBack={onBack} />;
}
