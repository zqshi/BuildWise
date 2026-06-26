import type { ChatSendStatus } from "../domain/workspace/types";
import type { FullCycleJobRef } from "../contexts/ChatContext";

/** 全流程运行中且持有可取消的任务句柄时，才显示停止按钮。
 *  双条件：状态为 processing-full-cycle（与轮询进度同源）+ fullCycleJob 非空（有 jobId 可调取消）。
 *  仅凭状态不可靠——状态可能在 job 句柄落定前先置位，或清句柄后状态尚未回退。 */
export function shouldShowStopButton(
  chatSendStatus: ChatSendStatus,
  fullCycleJob: FullCycleJobRef | null
): boolean {
  return chatSendStatus === "processing-full-cycle" && fullCycleJob !== null;
}
