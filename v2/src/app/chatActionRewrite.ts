import type { ChatActionDeps } from "./chatActions";
import { createMessage, resolveCoachErrorMessage } from "./chatActions";
import { rewriteIterationCode } from "./workspaceApi";

export async function handleRewrite(
  deps: ChatActionDeps,
  iterationId: number,
  instruction: string,
  dryRun: boolean
): Promise<void> {
  if (!instruction) {
    await createMessage(iterationId, "assistant", "请补充具体改写目标（例如：更新 KPI 卡片标题与数据源）。", deps.setChatMessages);
    return;
  }
  try {
    const rewrite = await rewriteIterationCode(iterationId, {
      instruction,
      dryRun,
      maxFiles: 6
    });
    const changed = rewrite.edits.map((item: { path: string }) => item.path).join("；") || "无变更";
    const header = rewrite.dryRun
      ? "我先预览了一下改动范围，还没有真正执行。"
      : "改动已经执行完了。";
    await createMessage(iterationId, "assistant", `${header}${rewrite.summary}\n涉及的文件：${changed}`, deps.setChatMessages);
    if (rewrite.outOfBoundaryFiles.length > 0) {
      await createMessage(iterationId, "system", `有几个文件超出了本轮迭代的变更边界，没有动：${rewrite.outOfBoundaryFiles.join("；")}`, deps.setChatMessages);
    }
  } catch (rewriteErr) {
    const msg = resolveCoachErrorMessage(rewriteErr);
    if (msg.includes("boundary")) {
      await createMessage(iterationId, "assistant", "当前迭代还没有配置代码变更边界（repository path 或 codePaths），暂时无法执行改写。请先在迭代设置中配置变更范围。", deps.setChatMessages);
    } else {
      await createMessage(iterationId, "assistant", `改写执行失败：${msg}`, deps.setChatMessages);
    }
  }
  await deps.loadIterationDetail(iterationId);
}
