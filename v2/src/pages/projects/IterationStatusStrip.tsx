import type { IterationStatus, IterationStateMachinePayload, Iteration, IterationContextPayload } from "./iterationWorkspacePanelTypes";

export type IterationStatusStripProps = {
  currentIteration: Iteration | null;
  stateMachine: IterationStateMachinePayload | null;
  contextData: IterationContextPayload | null;
  onTransitionState: (toStatus: IterationStatus) => void;
};

const statusLabelMap: Record<IterationStatus, string> = {
  planned: "规划中",
  "in-progress": "进行中",
  review: "评审中",
  blocked: "阻塞中",
  completed: "已完成"
};

const renderStatusLabel = (status: IterationStatus) => statusLabelMap[status] ?? status;

export function IterationStatusStrip({
  currentIteration,
  stateMachine,
  contextData,
  onTransitionState,
}: IterationStatusStripProps) {
  const scopeInCount = contextData?.scope.inScope.length ?? 0;
  const scopeOutCount = contextData?.scope.outOfScope.length ?? 0;
  const acceptanceCount = contextData?.scope.acceptanceCriteria.length ?? 0;
  const allowedTransitions = stateMachine?.allowedTransitions ?? [];
  const hasStateMachineActions = allowedTransitions.length > 0;

  return (
    <div className="iteration-status-strip">
      <span className={`status-pill ${stateMachine?.currentStatus || currentIteration?.status || "planned"}`}>
        {renderStatusLabel(stateMachine?.currentStatus || currentIteration?.status || "planned")}
      </span>
      <span>继承：{contextData?.previous ? contextData.previous.name : "首个版本"}</span>
      <span>范围 in/out：{scopeInCount}/{scopeOutCount}</span>
      <span>验收：{acceptanceCount} 项</span>
      {hasStateMachineActions ? (
        <div className="chat-tools">
          {allowedTransitions.slice(0, 2).map((status) => (
            <button key={status} type="button" className="btn ghost mini" onClick={() => onTransitionState(status)}>
              流转到 {renderStatusLabel(status)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export { renderStatusLabel };
