import type { IterationGeneratedTestCase } from "../../domain/workspace/iterationTypes";

export type TestMatrixExecutionPanelProps = {
  generatedTestMatrix: IterationGeneratedTestCase[];
  testMatrixStatusMap: Record<string, "pending" | "passed" | "failed" | "blocked" | "skipped">;
  testMatrixNoteMap: Record<string, string>;
  matrixSummary: {
    total: number;
    executed: number;
    passed: number;
    failed: number;
    blocked: number;
    skipped: number;
    coverage: number;
    passRate: number;
  };
  changeControlBusy: boolean;
  setTestMatrixStatusMap: React.Dispatch<React.SetStateAction<Record<string, "pending" | "passed" | "failed" | "blocked" | "skipped">>>;
  setTestMatrixNoteMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setChangeControlBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setChangeControlNotice: React.Dispatch<React.SetStateAction<string>>;
  onUpdateTestMatrixExecution: (
    updates: Array<{ caseId: string; status: "pending" | "passed" | "failed" | "blocked" | "skipped"; by?: string; note?: string }>
  ) => void | Promise<void>;
  onGenerateTestArtifacts: (dryRun?: boolean) => void | Promise<void>;
  onRefreshReleaseReview: () => void | Promise<void>;
};

export function TestMatrixExecutionPanel({
  generatedTestMatrix,
  testMatrixStatusMap,
  testMatrixNoteMap,
  matrixSummary,
  changeControlBusy,
  setTestMatrixStatusMap,
  setTestMatrixNoteMap,
  setChangeControlBusy,
  setChangeControlNotice,
  onUpdateTestMatrixExecution,
  onGenerateTestArtifacts,
  onRefreshReleaseReview,
}: TestMatrixExecutionPanelProps) {
  return (
    <div className="info-box">
      <h3>测试矩阵执行</h3>
      <p>
        总数 {matrixSummary.total}，已执行 {matrixSummary.executed}，通过 {matrixSummary.passed}，失败 {matrixSummary.failed}，阻断 {matrixSummary.blocked}，
        覆盖率 {matrixSummary.coverage}% ，通过率 {matrixSummary.passRate}%
      </p>
      <div className="chat-tools">
        <button
          type="button"
          className="btn ghost mini"
          disabled={changeControlBusy}
          onClick={() =>
            setTestMatrixStatusMap(
              Object.fromEntries(generatedTestMatrix.map((item) => [item.caseId, "passed"])) as Record<
                string,
                "pending" | "passed" | "failed" | "blocked" | "skipped"
              >
            )
          }
        >
          全部标记为 passed
        </button>
        <button
          type="button"
          className="btn ghost mini"
          disabled={changeControlBusy}
          onClick={() =>
            setTestMatrixStatusMap(
              Object.fromEntries(generatedTestMatrix.map((item) => [item.caseId, "pending"])) as Record<
                string,
                "pending" | "passed" | "failed" | "blocked" | "skipped"
              >
            )
          }
        >
          全部重置为 pending
        </button>
      </div>
      <ul className="history-list">
        {generatedTestMatrix.map((item) => (
          <li key={item.caseId} className="history-item">
            <strong>
              [{item.type}] {item.caseId}
            </strong>
            <p>focus：{item.focus || "-"}</p>
            <p>expected：{item.expected || "-"}</p>
            <p className="hint">evidence：{item.evidence || "-"}</p>
            <div className="chat-tools">
              <select
                value={testMatrixStatusMap[item.caseId] || "pending"}
                onChange={(event) => {
                  const next = event.target.value as "pending" | "passed" | "failed" | "blocked" | "skipped";
                  setTestMatrixStatusMap((prev) => ({ ...prev, [item.caseId]: next }));
                }}
              >
                <option value="pending">pending</option>
                <option value="passed">passed</option>
                <option value="failed">failed</option>
                <option value="blocked">blocked</option>
                <option value="skipped">skipped</option>
              </select>
            </div>
            <label className="hint">
              执行备注
              <textarea
                rows={2}
                value={testMatrixNoteMap[item.caseId] || ""}
                onChange={(event) =>
                  setTestMatrixNoteMap((prev) => ({
                    ...prev,
                    [item.caseId]: event.target.value
                  }))
                }
              />
            </label>
          </li>
        ))}
      </ul>
      <div className="chat-tools">
        <button
          type="button"
          className="btn ghost mini"
          disabled={changeControlBusy}
          onClick={async () => {
            const updates = generatedTestMatrix
              .map((item) => {
                const status = testMatrixStatusMap[item.caseId] || item.executionStatus;
                const note = (testMatrixNoteMap[item.caseId] || "").trim();
                const changed = status !== item.executionStatus || note !== (item.executionNote || "");
                return changed
                  ? {
                      caseId: item.caseId,
                      status,
                      note
                    }
                  : null;
              })
              .filter(Boolean) as Array<{
              caseId: string;
              status: "pending" | "passed" | "failed" | "blocked" | "skipped";
              note?: string;
            }>;
            if (updates.length === 0) {
              return;
            }
            setChangeControlBusy(true);
            try {
              await onUpdateTestMatrixExecution(updates);
              setChangeControlNotice(`已保存 ${updates.length} 条测试执行状态。`);
            } finally {
              setChangeControlBusy(false);
            }
          }}
        >
          保存测试执行状态
        </button>
        <button
          type="button"
          className="btn secondary"
          disabled={changeControlBusy}
          onClick={async () => {
            setChangeControlBusy(true);
            try {
              await onGenerateTestArtifacts(true);
              setChangeControlNotice("已生成测试产物计划（dry-run）。");
            } finally {
              setChangeControlBusy(false);
            }
          }}
        >
          生成测试产物（Dry Run）
        </button>
        <button
          type="button"
          className="btn ghost"
          disabled={changeControlBusy}
          onClick={async () => {
            setChangeControlBusy(true);
            try {
              await onRefreshReleaseReview();
              setChangeControlNotice("已刷新发布前质量评审。");
            } finally {
              setChangeControlBusy(false);
            }
          }}
        >
          刷新发布评审
        </button>
      </div>
    </div>
  );
}
