import { createContext, useContext, useRef, useState, useMemo, type ReactNode } from "react";
import type {
  AttachmentAnalysisReport,
  AssessmentPayload,
  AssessmentSnapshot,
  IterationStateMachinePayload,
} from "../domain/workspace/types";
import type { UploadAnalysisProgress, UploadedAttachmentMeta } from "../domain/workspace/analysisTypes";

type AnalysisContextValue = {
  uploadedFile: UploadedAttachmentMeta | null;
  setUploadedFile: React.Dispatch<React.SetStateAction<UploadedAttachmentMeta | null>>;
  analysisReport: AttachmentAnalysisReport | null;
  setAnalysisReport: React.Dispatch<React.SetStateAction<AttachmentAnalysisReport | null>>;
  showAnalysisPanel: boolean;
  setShowAnalysisPanel: React.Dispatch<React.SetStateAction<boolean>>;
  isAnalyzingAttachment: boolean;
  setIsAnalyzingAttachment: React.Dispatch<React.SetStateAction<boolean>>;
  uploadAnalysisProgress: UploadAnalysisProgress | null;
  setUploadAnalysisProgress: React.Dispatch<React.SetStateAction<UploadAnalysisProgress | null>>;
  uploadToastMessage: string | null;
  setUploadToastMessage: React.Dispatch<React.SetStateAction<string | null>>;
  assessmentData: AssessmentPayload | null;
  setAssessmentData: React.Dispatch<React.SetStateAction<AssessmentPayload | null>>;
  assessmentHistory: AssessmentSnapshot[];
  setAssessmentHistory: React.Dispatch<React.SetStateAction<AssessmentSnapshot[]>>;
  stateMachine: IterationStateMachinePayload | null;
  setStateMachine: React.Dispatch<React.SetStateAction<IterationStateMachinePayload | null>>;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
};

const AnalysisContext = createContext<AnalysisContextValue | null>(null);

export function AnalysisProvider({ children }: { children: ReactNode }) {
  const [uploadedFile, setUploadedFile] = useState<UploadedAttachmentMeta | null>(null);
  const [analysisReport, setAnalysisReport] = useState<AttachmentAnalysisReport | null>(null);
  const [showAnalysisPanel, setShowAnalysisPanel] = useState(false);
  const [isAnalyzingAttachment, setIsAnalyzingAttachment] = useState(false);
  const [uploadAnalysisProgress, setUploadAnalysisProgress] = useState<UploadAnalysisProgress | null>(null);
  const [uploadToastMessage, setUploadToastMessage] = useState<string | null>(null);
  const [assessmentData, setAssessmentData] = useState<AssessmentPayload | null>(null);
  const [assessmentHistory, setAssessmentHistory] = useState<AssessmentSnapshot[]>([]);
  const [stateMachine, setStateMachine] = useState<IterationStateMachinePayload | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const value = useMemo(
    () => ({
      uploadedFile,
      setUploadedFile,
      analysisReport,
      setAnalysisReport,
      showAnalysisPanel,
      setShowAnalysisPanel,
      isAnalyzingAttachment,
      setIsAnalyzingAttachment,
      uploadAnalysisProgress,
      setUploadAnalysisProgress,
      uploadToastMessage,
      setUploadToastMessage,
      assessmentData,
      setAssessmentData,
      assessmentHistory,
      setAssessmentHistory,
      stateMachine,
      setStateMachine,
      fileInputRef,
    }),
    [
      uploadedFile,
      analysisReport,
      showAnalysisPanel,
      isAnalyzingAttachment,
      uploadAnalysisProgress,
      uploadToastMessage,
      assessmentData,
      assessmentHistory,
      stateMachine,
    ]
  );

  return <AnalysisContext.Provider value={value}>{children}</AnalysisContext.Provider>;
}

export function useAnalysisContext() {
  const ctx = useContext(AnalysisContext);
  if (!ctx) throw new Error("Missing AnalysisProvider");
  return ctx;
}
