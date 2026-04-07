import type { ChatActionDeps } from "./chatActions";
import { createMessage } from "./chatActions";
import { executeIterationVisualEdit } from "./workspaceApi";
import type { IterationVisualEditResponse } from "../domain/workspace/types";

export async function handlePrototype(
  deps: ChatActionDeps,
  iterationId: number,
  text: string,
  options: {
    prototypeTarget: string;
    interactionContext?: {
      mode?: "html" | "image" | "prototype";
      target?: string;
      summary?: string;
      html?: {
        selector?: string;
        tag?: string;
        text?: string;
        styles?: Record<string, string>;
      };
    };
    prototypeSummary?: string;
  }
): Promise<IterationVisualEditResponse> {
  deps.setChatSendStatus("processing-executing");
  const visualEditResult = await executeIterationVisualEdit(iterationId, {
    message: text,
    target: {
      mode: options.interactionContext?.mode || "prototype",
      target: options.interactionContext?.target || options.prototypeTarget || "",
      summary: options.interactionContext?.summary || options.prototypeSummary || "",
      html: options.interactionContext?.html
    }
  });
  await createMessage(
    iterationId,
    "assistant",
    `改好了。${visualEditResult.summary}`,
    deps.setChatMessages
  );
  if (visualEditResult.warnings.length > 0) {
    await createMessage(iterationId, "assistant", `顺便提一下：${visualEditResult.warnings.join("；")}`, deps.setChatMessages);
  }
  deps.setChatSendStatus("idle");
  return visualEditResult;
}
