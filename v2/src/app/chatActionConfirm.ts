import type { ChatActionDeps } from "./chatActions";
import { createMessage, resolveCoachErrorMessage } from "./chatActions";
import { confirmIterationAnalysis } from "./workspaceApi";
import type { Iteration } from "../domain/workspace/types";

export async function handleConfirmInaccurate(
  deps: ChatActionDeps,
  iterationId: number,
  text: string,
  currentIteration: Iteration
): Promise<void> {
  await confirmIterationAnalysis(iterationId, {
    accurate: false,
    note: text,
    actor: deps.currentRole,
    resolvedClarificationQuestions: currentIteration.changeControl?.clarificationDraftResolvedQuestions ?? []
  });
  await createMessage(
    iterationId,
    "assistant",
    "收到，看来之前的理解有偏差。你能补充一下你预期的范围和验收结果吗？我重新对齐一下。",
    deps.setChatMessages
  );
  await deps.loadIterationDetail(iterationId);
  if (deps.currentProjectId) await deps.loadIterations(deps.currentProjectId);
  await deps.loadGovernance();
}

export async function handleConfirmAccurate(
  deps: ChatActionDeps,
  iterationId: number,
  text: string,
  currentIteration: Iteration
): Promise<void> {
  if (deps.analysisReport?.reportQuality && !deps.analysisReport.reportQuality.publishable) {
    await createMessage(
      iterationId,
      "assistant",
      `当前分析报告未达到发布门禁（${deps.analysisReport.reportQuality.score}分）：${deps.analysisReport.reportQuality.summary || "请先补齐缺失项后再确认。"}`,
      deps.setChatMessages
    );
    return;
  }
  const allQuestions = currentIteration.changeControl?.clarificationQuestions ?? [];
  try {
    await confirmIterationAnalysis(iterationId, {
      accurate: true,
      note: text,
      actor: deps.currentRole,
      resolvedClarificationQuestions: allQuestions
    });
  } catch (confirmErr) {
    const errMsg = resolveCoachErrorMessage(confirmErr);
    if (errMsg.includes("409") || errMsg.includes("clarification") || errMsg.includes("unresolved")) {
      const questions = currentIteration.changeControl?.clarificationQuestions ?? [];
      const questionList = questions.length > 0
        ? questions.map((q, i) => `${i + 1}. ${q}`).join("\n")
        : "（暂无具体问题列表，请补充更多信息后重试）";
      await createMessage(
        iterationId,
        "assistant",
        `还有 ${questions.length} 个待澄清的问题需要先确认：\n\n${questionList}\n\n请逐个回复以上问题，全部确认后我会继续推进。`,
        deps.setChatMessages
      );
      return;
    }
    throw confirmErr;
  }
  await createMessage(iterationId, "assistant", "分析确认完成了。接下来你可以：\n• 输入「开始拆解任务」生成本迭代执行清单\n• 输入「审阅技术架构文档」查看技术方案\n• 或者直接告诉我你想先推进哪块。", deps.setChatMessages);
  await deps.loadIterationDetail(iterationId);
  if (deps.currentProjectId) await deps.loadIterations(deps.currentProjectId);
  await deps.loadGovernance();
}
