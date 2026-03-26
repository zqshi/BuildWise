import { useState } from "react";
import type { Project } from "../../domain/workspace/types";
import { sendOpenclawProjectChat } from "../../app/workspaceApi";
import { composeOpenclawProjectMessage, type OpenclawDialogMode } from "../layout/openclawPromptComposer";

type UseOpenclawChatParams = {
  currentProject: Project | null;
  loadPolicyData: () => Promise<void>;
};

export function useOpenclawChat({ currentProject, loadPolicyData }: UseOpenclawChatParams) {
  const [openclawChatInput, setOpenclawChatInput] = useState("");
  const [openclawChatBusy, setOpenclawChatBusy] = useState(false);
  const [openclawDialogMode, setOpenclawDialogMode] = useState<OpenclawDialogMode>("native");
  const [openclawChatLines, setOpenclawChatLines] = useState<Array<{ role: "admin" | "openclaw"; content: string; at: string }>>([]);

  const handleOpenclawSend = async () => {
    if (!currentProject || !openclawChatInput.trim()) return;
    const text = openclawChatInput.trim();
    setOpenclawChatLines((prev) => [...prev, { role: "admin", content: text, at: new Date().toISOString() }]);
    setOpenclawChatInput("");
    try {
      setOpenclawChatBusy(true);
      const payload = composeOpenclawProjectMessage(text, openclawDialogMode);
      const result = await sendOpenclawProjectChat(currentProject.id, payload, "owner");
      setOpenclawChatLines((prev) => [...prev, { role: "openclaw", content: result.reply, at: new Date().toISOString() }]);
      await loadPolicyData();
    } catch (error) {
      setOpenclawChatLines((prev) => [
        ...prev,
        { role: "openclaw", content: error instanceof Error ? error.message : "OpenClaw 对话失败", at: new Date().toISOString() }
      ]);
    } finally {
      setOpenclawChatBusy(false);
    }
  };

  return {
    openclawChatInput,
    setOpenclawChatInput,
    openclawChatBusy,
    openclawDialogMode,
    setOpenclawDialogMode,
    openclawChatLines,
    handleOpenclawSend
  };
}
