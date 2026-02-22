import type { IterationStatus } from "./iterationTypes";

export type AgentScope = "attachment" | "iteration" | "full-cycle" | "release";
export type AgentRole =
  | "orchestrator"
  | "requirements-analyst"
  | "task-planner"
  | "delivery-engineer"
  | "qa-reviewer"
  | "iteration-coach"
  | "boundary-guardian"
  | "release-ops-advisor";

export type IterationAgentPrompt = {
  agentId: string;
  role: AgentRole;
  scope: AgentScope;
  goal: string;
  systemPrompt: string;
  userPrompt: string;
  expectedOutput: string;
};

export type IterationAgentPlan = {
  strategy: "single-agent" | "multi-agent";
  scope: AgentScope;
  objective: string;
  recommendedTransition: IterationStatus | null;
  executionLoop: string[];
  prompts: IterationAgentPrompt[];
};

export type IterationAgentOutput = {
  agentId: string;
  role: IterationAgentPrompt["role"];
  status: "success" | "error";
  content: string;
  model?: string;
  error?: string;
};

export type VisionPayload = {
  path: string;
  mimeType: string;
  dataUrl: string;
};

export type IterationLifecycleAction = {
  attempted: boolean;
  applied: boolean;
  fromStatus: IterationStatus;
  toStatus: IterationStatus | null;
  note: string;
};

export type AttachmentAnalysisReport = {
  iterationId: number;
  iterationName: string;
  fileName: string;
  sourceType: "single-file" | "folder";
  analyzedTarget: string;
  fileStats: {
    totalFiles: number;
    textFiles: number;
    binaryFiles: number;
  };
  fileSelection: {
    consideredFiles: number;
    includedFiles: number;
    skippedNoiseFiles: number;
    skippedEmptyFiles: number;
    sampled: boolean;
    sampleReason: string;
    includedPaths: string[];
    ignoredFiles: Array<{ path: string; reason: string }>;
  };
  projectDetection: {
    projectName: string;
    productName: string;
    projectCategory: string;
    evidence: string[];
    confidence: "high" | "medium" | "low";
  };
  meaningfulFindings: string[];
  prioritizedFindings: Array<{
    priority: "P0" | "P1" | "P2";
    content: string;
    reason: string;
  }>;
  nextActions: string[];
  analyzedAt: string;
  attachmentInsights: {
    projectCategory: string;
    artifactType: string;
    keyCharacteristics: string[];
    versionChangeSummary: string;
    confidence: "high" | "medium" | "low";
    limitations: string[];
  };
  llmContext: {
    strategy: string;
    digest: string;
    excerptLength: number;
    chunkCount: number;
    promptContextLength: number;
    agentCount: number;
    unknownSignalCount: number;
    degraded: boolean;
    degradeReason: string;
  };
  clarificationQuestions: string[];
  understanding: string;
  versionDiff: {
    baselineIterationName: string;
    added: string[];
    changed: string[];
    removed: string[];
  };
  versionDiffDetailed: {
    summary: string;
    impactScope: string[];
    riskPoints: string[];
    added: Array<{ dimension: string; item: string; impact: string; risk: "low" | "medium" | "high" }>;
    changed: Array<{ dimension: string; item: string; impact: string; risk: "low" | "medium" | "high" }>;
    removed: Array<{ dimension: string; item: string; impact: string; risk: "low" | "medium" | "high" }>;
  };
  diffLocations: Array<{
    dimension: "goals" | "inScope" | "outOfScope" | "acceptanceCriteria";
    changeType: "added" | "removed" | "changed";
    currentItem: string;
    baselineItem?: string;
  }>;
  cyclePhase: "scope-clarified" | "task-planning" | "build-in-progress" | "qa-review" | "ready-for-release";
  agentPlan: IterationAgentPlan;
  agentOutputs: IterationAgentOutput[];
  lifecycleAction: IterationLifecycleAction;
  risks: string[];
  suggestions: string[];
  traceabilityMap: {
    requirementToComponent: Array<{ requirement: string; components: string[]; evidence: string }>;
    componentToCode: Array<{ component: string; codePaths: string[]; evidence: string }>;
    requirementToCode: Array<{ requirement: string; codePaths: string[]; evidence: string }>;
    coverageScore: number;
    mappingConfidence: "high" | "medium" | "low";
    unmappedRequirements: string[];
    conflicts: string[];
    gaps: string[];
  };
  executableConstraints: {
    componentWhitelist: string[];
    codePathWhitelist: string[];
    acceptanceChecks: string[];
    gateRules: string[];
  };
  releaseReview: {
    decision: "go" | "caution" | "block";
    reason: string;
    blockers: string[];
    releaseGates: string[];
    recommendations: string[];
    rollback: {
      shouldRollback: boolean;
      reason: string;
      trigger: string;
      actions: string[];
    };
    qualitySignals: {
      testCaseCount: number;
      p0FindingCount: number;
      unknownSignalCount: number;
      boundaryCoverage: number;
    };
  };
  qualityArtifacts: {
    unitTests: string[];
    contractTests: string[];
    acceptanceChecklist: string[];
    regressionPoints: string[];
    materializedFiles: string[];
  };
  domainKnowledge: {
    terms: Array<{
      term: string;
      definition: string;
      mappedTo: {
        pages: string[];
        apis: string[];
        entities: string[];
        codePaths: string[];
      };
      evidence: string;
      bindingStrength: "high" | "medium" | "low";
    }>;
    rules: string[];
    unknowns: string[];
  };
  opsTriage: {
    hypotheses: Array<{ priority: string; item: string; evidence: string }>;
    triageSteps: Array<{ step: string; expectedSignal: string; fallback: string }>;
    rollbackSuggestion: string;
  };
};

export type AttachmentUploadInput = {
  fileName: string;
  mimeType: string;
  size: number;
  excerpt: string;
  sourceType?: "single-file" | "folder";
  folderName?: string;
  files?: Array<{
    path: string;
    fileName: string;
    mimeType: string;
    size: number;
    excerpt: string;
    imageDataUrl?: string;
  }>;
  visionPayloads?: VisionPayload[];
  excerptChunks?: string[];
  excerptDigest?: string;
  excerptStrategy?: "direct" | "chunked-head-middle-tail" | "binary-no-text" | "folder-batch";
  agentScope?: AgentScope;
  forceMultiAgent?: boolean;
  autoTransition?: boolean;
};

export type AttachmentAnalysisJobStatus = "queued" | "running" | "succeeded" | "failed";

export type AttachmentAnalysisJob = {
  jobId: string;
  iterationId: number;
  status: AttachmentAnalysisJobStatus;
  createdAt: string;
  startedAt: string;
  finishedAt: string;
  inputSummary: {
    fileName: string;
    sourceType: "single-file" | "folder";
    folderName: string;
    totalFiles: number;
    totalBytes: number;
  };
  progress: {
    totalFiles: number;
    processedFiles: number;
    totalBatches: number;
    completedBatches: number;
    failedBatches: number;
    retriedBatches: number;
  };
  warnings: string[];
  error: string;
  result: AttachmentAnalysisReport | null;
};

export type UploadAnalysisProgress = {
  stage: "preparing" | "queued" | "running" | "succeeded" | "failed";
  label: string;
  detail: string;
  percent: number;
  jobId?: string;
};

export type UploadedAttachmentMeta = {
  name: string;
  iterationId: number;
  hasDocumentAssets: boolean;
  hasPrototypeAssets: boolean;
  uploadKind: "documents" | "prototype" | "mixed" | "other";
  prototypeItems: string[];
  htmlPreviews: Array<{
    name: string;
    path: string;
    content: string;
  }>;
  imagePreviews: Array<{
    name: string;
    path: string;
    dataUrl: string;
  }>;
};

export type IterationCoachChatResponse = {
  iterationId: number;
  intent: "collect-attachment" | "clarify" | "confirm-boundary" | "plan" | "qa" | "release" | "general";
  reply: string;
  guidance: {
    uploadRecommended: boolean;
    suggestedUploadTypes: string[];
    suggestedActions: string[];
    clarificationChecklist: string[];
  };
  llm: {
    used: boolean;
    model: string;
    degraded: boolean;
    reason: string;
  };
};

export type IterationVisualEditAction = {
  op: "set-text" | "set-style" | "toggle-visibility" | "resize";
  property?: string;
  value: string;
};

export type IterationVisualEditResponse = {
  iterationId: number;
  status: "applied" | "needs-clarification";
  reply: string;
  summary: string;
  scope: "selected-element" | "prototype-target";
  actions: IterationVisualEditAction[];
  warnings: string[];
  target: {
    mode: "html" | "image" | "prototype";
    target: string;
  };
};

export type IterationCodeRewriteResponse = {
  iterationId: number;
  dryRun: boolean;
  summary: string;
  warnings: string[];
  appliedFiles: string[];
  skippedFiles: string[];
  outOfBoundaryFiles: string[];
  edits: Array<{
    path: string;
    reason: string;
    beforePreview: string;
    afterPreview: string;
  }>;
};

export type IterationTestArtifactsGenerationResponse = {
  iterationId: number;
  dryRun: boolean;
  summary: string;
  generatedFiles: string[];
  skippedFiles: string[];
  warnings: string[];
};

export type IterationReleaseReviewResponse = {
  iterationId: number;
  decision: "go" | "caution" | "block";
  score: number;
  blockers: string[];
  warnings: string[];
  recommendations: string[];
  rollback: {
    shouldRollback: boolean;
    reason: string;
    trigger: string;
    actions: string[];
  };
  evidence: {
    testMatrixCoverage: number;
    testMatrixPassRate: number;
    traceabilityCoverage: number;
    boundaryReady: boolean;
    acceptanceChecklistCount: number;
  };
  generatedAt: string;
};

export type OpsAlertTriageResponse = {
  generatedAt: string;
  projectId: number;
  severity: "low" | "medium" | "high" | "critical";
  hypotheses: Array<{ priority: "P0" | "P1" | "P2"; item: string; evidence: string }>;
  triageSteps: Array<{ step: string; expectedSignal: string; fallback: string; commands: string[] }>;
  rollbackSuggestion: string;
  matchedTemplates: string[];
  disposition?: {
    action: "observe" | "mitigate" | "rollback";
    escalationOwner: string;
    rationale: string;
    rollbackTrigger: string;
  };
};
