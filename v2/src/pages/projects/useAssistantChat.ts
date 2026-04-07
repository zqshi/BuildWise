/**
 * Assistant chat hook for project overview — placeholder.
 */
import { useState } from "react";

import type { AssistantDialogMode } from "../layout/assistantPromptComposer";

export type AssistantChatLine = {
  role: "admin" | "assistant";
  content: string;
  at: string;
};

export function useAssistantChat(_deps: Record<string, unknown>) {
  const [assistantChatLines] = useState<AssistantChatLine[]>([]);
  const [assistantDialogMode, setAssistantDialogMode] = useState<AssistantDialogMode>("native");
  const [assistantChatInput, setAssistantChatInput] = useState("");
  const [assistantChatBusy] = useState(false);

  const handleAssistantSend = async () => {
    // Placeholder — will integrate with backend coach conversation API
  };

  return {
    assistantChatLines,
    assistantDialogMode,
    setAssistantDialogMode,
    assistantChatInput,
    setAssistantChatInput,
    assistantChatBusy,
    handleAssistantSend,
  };
}
