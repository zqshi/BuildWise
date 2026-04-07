import type { IterationAgentOutput, IterationAgentPrompt } from "../../domain/workspace/types";
import { LlmInvocationError } from "./agentRunner";

export function resolvePlanParallelismFromEnv(processEnv: Record<string, string | undefined>) {
  const configuredParallelism = Number.parseInt((processEnv.LLM_PLAN_PARALLELISM || "").trim(), 10);
  return Number.isInteger(configuredParallelism) && configuredParallelism > 0 ? Math.min(configuredParallelism, 6) : 2;
}

export async function executeAgentPlanPromptsOp(params: {
  prompts: IterationAgentPrompt[];
  parallelism: number;
  imageDataUrls: string[];
  runPrompt: (prompt: IterationAgentPrompt, options: { imageDataUrls: string[] }) => Promise<{ content: string; model?: string }>;
}): Promise<IterationAgentOutput[]> {
  const outputs: IterationAgentOutput[] = [];
  for (let i = 0; i < params.prompts.length; i += params.parallelism) {
    const group = params.prompts.slice(i, i + params.parallelism);
    const groupOutputs = await Promise.all(
      group.map(async (prompt) => {
        let result: { content: string; model?: string };
        try {
          result = await params.runPrompt(prompt, { imageDataUrls: params.imageDataUrls });
        } catch (error) {
          throw new LlmInvocationError(`LLM invocation failed for ${prompt.role}: ${error instanceof Error ? error.message : "unknown_error"}`);
        }
        return {
          agentId: prompt.agentId,
          role: prompt.role,
          status: "success",
          content: result.content,
          model: result.model
        } as IterationAgentOutput;
      })
    );
    outputs.push(...groupOutputs);
  }
  return outputs;
}
