import { createContext, useContext, useState, useMemo, type ReactNode } from "react";
import type { IterationMessage, ChatSendStatus, IterationContextPayload } from "../domain/workspace/types";

type ChangeImpact = {
  hasImpact: boolean;
  affectedTerms: string[];
  affectedArtifacts: string[];
  affectedEntities: string[];
  affectedRules: string[];
  summary: string;
};

type ChatContextValue = {
  chatInput: string;
  setChatInput: React.Dispatch<React.SetStateAction<string>>;
  chatMessages: IterationMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<IterationMessage[]>>;
  chatSendStatus: ChatSendStatus;
  setChatSendStatus: React.Dispatch<React.SetStateAction<ChatSendStatus>>;
  contextData: IterationContextPayload | null;
  setContextData: React.Dispatch<React.SetStateAction<IterationContextPayload | null>>;
  changeImpact: ChangeImpact | null;
  setChangeImpact: React.Dispatch<React.SetStateAction<ChangeImpact | null>>;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<IterationMessage[]>([]);
  const [chatSendStatus, setChatSendStatus] = useState<ChatSendStatus>("idle");
  const [contextData, setContextData] = useState<IterationContextPayload | null>(null);
  const [changeImpact, setChangeImpact] = useState<ChangeImpact | null>(null);

  const value = useMemo(
    () => ({
      chatInput,
      setChatInput,
      chatMessages,
      setChatMessages,
      chatSendStatus,
      setChatSendStatus,
      contextData,
      setContextData,
      changeImpact,
      setChangeImpact,
    }),
    [chatInput, chatMessages, chatSendStatus, contextData, changeImpact]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("Missing ChatProvider");
  return ctx;
}
