/**
 * Retry and Compensation — 重试和补偿机制
 *
 * 为不稳定的 LLM 调用提供可控的重试和补偿逻辑。
 * 支持指数退避、最大重试次数、补偿策略等。
 */

import type { AgentRunResult } from "../../domain/shared/agentRunner";
import type { IterationAgentPrompt } from "../../domain/workspace/types";
import type { ValidationResult } from "./artifactValidator";
import { generateRetryPrompt, validateArtifactDraft } from "./artifactValidator";
import { createLogger } from "../../infrastructure/runtime/logger";

const log = createLogger("retry-compensation");

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

export const DEFAULT_RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  backoffMultiplier: 2,
  maxDelayMs: 10000
} as const;

export type RetryConfig = typeof DEFAULT_RETRY_CONFIG;

// ---------------------------------------------------------------------------
// 重试结果类型
// ---------------------------------------------------------------------------

export type RetryResult<T> = {
  success: boolean;
  result?: T;
  attempts: number;
  errors: Array<{ attempt: number; error: string }>;
  fallbackToManual?: boolean;
  compensationAction?: string;
};

// ---------------------------------------------------------------------------
// 重试执行器
// ---------------------------------------------------------------------------

class RetryExecutor {
  /**
   * 带指数退避的重试
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig = DEFAULT_RETRY_CONFIG,
    context: string = ""
  ): Promise<RetryResult<T>> {
    const errors: Array<{ attempt: number; error: string }> = [];
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        log.info(`[retry] Attempt ${attempt}/${config.maxAttempts}${context ? ` for ${context}` : ""}`);

        const result = await operation();

        if (attempt > 1) {
          log.info(`[retry] Success on attempt ${attempt}${context ? ` for ${context}` : ""}`);
        }

        return {
          success: true,
          result,
          attempts: attempt,
          errors
        };
      } catch (error) {
        const errorStr = error instanceof Error ? error.message : String(error);
        lastError = error as Error;

        errors.push({
          attempt,
          error: errorStr
        });

        log.warn(`[retry] Attempt ${attempt} failed: ${errorStr}${context ? ` for ${context}` : ""}`);

        // 最后一次尝试失败，不再等待
        if (attempt === config.maxAttempts) {
          break;
        }

        // 计算退避延迟
        const delayMs = Math.min(
          config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelayMs
        );

        log.info(`[retry] Waiting ${delayMs}ms before next attempt...`);
        await this.sleep(delayMs);
      }
    }

    log.error(`[retry] All ${config.maxAttempts} attempts failed for ${context}`);

    return {
      success: false,
      attempts: config.maxAttempts,
      errors,
      compensationAction: this.suggestCompensation(lastError)
    };
  }

  /**
   * 交付物专用重试（带验证）
   */
  async generateArtifactWithValidation(
    artifactId: string,
    basePrompt: IterationAgentPrompt,
    agentRunner: any,
    maxAttempts: number = DEFAULT_RETRY_CONFIG.maxAttempts
  ): Promise<RetryResult<string>> {
    const errors: Array<{ attempt: number; error: string }> = [];
    let lastContent = "";
    let lastValidation: ValidationResult | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        log.info(`[artifact-retry] Generating ${artifactId}, attempt ${attempt}/${maxAttempts}`);

        // 执行 LLM 生成
        const result = await agentRunner.run(basePrompt);
        lastContent = result.content;

        // 验证输出
        const validation = validateArtifactDraft(artifactId, lastContent);
        lastValidation = validation;

        if (validation.valid) {
          log.info(`[artifact-retry] Valid output on attempt ${attempt} for ${artifactId}`);
          return {
            success: true,
            result: lastContent,
            attempts: attempt,
            errors
          };
        }

        // 验证失败，记录错误
        const validationErrors = validation.errors.map(e => e.message).join("; ");
        errors.push({
          attempt,
          error: `Validation failed: ${validationErrors}`
        });

        log.warn(`[artifact-retry] Validation failed on attempt ${attempt}: ${validationErrors}`);

        // 构建带错误反馈的重试 Prompt
        const retryPrompt = this.buildRetryPrompt(artifactId, basePrompt, validation);

        // 最后一次尝试失败，不再重试
        if (attempt === maxAttempts) {
          break;
        }

        // 等待后重试
        await this.sleep(DEFAULT_RETRY_CONFIG.initialDelayMs * Math.pow(DEFAULT_RETRY_CONFIG.backoffMultiplier, attempt - 1));
        basePrompt = { ...basePrompt, userPrompt: retryPrompt };

      } catch (error) {
        const errorStr = error instanceof Error ? error.message : String(error);
        errors.push({
          attempt,
          error: errorStr
        });

        log.error(`[artifact-retry] Exception on attempt ${attempt}: ${errorStr}`);

        if (attempt === maxAttempts) {
          break;
        }

        await this.sleep(DEFAULT_RETRY_CONFIG.initialDelayMs * Math.pow(DEFAULT_RETRY_CONFIG.backoffMultiplier, attempt - 1));
      }
    }

    // 所有尝试失败，分析是否可以降级到手动处理
    const canFallback = this.canFallbackToManual(artifactId, lastValidation);

    log.error(`[artifact-retry] All ${maxAttempts} attempts failed for ${artifactId}`);

    return {
      success: false,
      attempts: maxAttempts,
      errors,
      fallbackToManual: canFallback,
      compensationAction: canFallback ? "Manual completion required" : "Provide fallback template"
    };
  }

  private buildRetryPrompt(
    artifactId: string,
    basePrompt: IterationAgentPrompt,
    validation: ValidationResult
  ): string {
    const retryInstruction = generateRetryPrompt(artifactId, validation.errors, "");

    return `${basePrompt.userPrompt}\n\n${retryInstruction}`;
  }

  private canFallbackToManual(artifactId: string, validation: ValidationResult | null): boolean {
    // 对于简单交付物，可以提供模板让用户手动编辑
    const simpleArtifacts = ["test-matrix", "boundary-confirmation", "product-requirements-doc"];

    if (simpleArtifacts.includes(artifactId)) {
      return true;
    }

    // 如果验证错误数量较少，也可以降级
    if (validation && validation.errors.length <= 2) {
      return true;
    }

    return false;
  }

  private suggestCompensation(error: Error | null): string | undefined {
    if (!error) return undefined;

    const errorMsg = error.message.toLowerCase();

    if (errorMsg.includes("timeout") || errorMsg.includes("abort")) {
      return "Increase timeout or reduce input size";
    }

    if (errorMsg.includes("rate limit") || errorMsg.includes("429")) {
      return "Wait and retry with exponential backoff";
    }

    if (errorMsg.includes("token") || errorMsg.includes("auth")) {
      return "Check API credentials";
    }

    if (errorMsg.includes("model")) {
      return "Verify model availability";
    }

    return "Review error details and adjust request";
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// 补偿操作
// ---------------------------------------------------------------------------

export type CompensationAction = {
  type: "retry" | "fallback" | "skip" | "manual";
  description: string;
  execute: () => Promise<void>;
};

class CompensationManager {
  private readonly pendingActions = new Map<string, CompensationAction>();

  /**
   * 添加补偿操作
   */
  addCompensation(id: string, action: CompensationAction): void {
    this.pendingActions.set(id, action);
    log.info(`[compensation] Added compensation action: ${id} - ${action.type}`);
  }

  /**
   * 执行所有待处理的补偿操作
   */
  async executePendingCompensations(): Promise<{ executed: number; failed: number }> {
    const actions = Array.from(this.pendingActions.values());
    this.pendingActions.clear();

    if (actions.length === 0) {
      return { executed: 0, failed: 0 };
    }

    let executed = 0;
    let failed = 0;

    log.info(`[compensation] Executing ${actions.length} pending compensation actions`);

    for (const action of actions) {
      try {
        await action.execute();
        executed++;
        log.info(`[compensation] Executed: ${action.type}`);
      } catch (error) {
        failed++;
        log.error(`[compensation] Failed: ${action.type}`, error);
      }
    }

    return { executed, failed };
  }

  /**
   * 获取待处理的补偿操作
   */
  getPendingCompensations(): CompensationAction[] {
    return Array.from(this.pendingActions.values());
  }

  /**
   * 清除特定补偿操作
   */
  clearCompensation(id: string): void {
    this.pendingActions.delete(id);
    log.info(`[compensation] Cleared compensation action: ${id}`);
  }
}

// ---------------------------------------------------------------------------
// 公共 API
// ---------------------------------------------------------------------------

const retryExecutor = new RetryExecutor();
const compensationManager = new CompensationManager();

export {
  retryExecutor,
  compensationManager,

  /**
   * 带重试的 LLM 调用
   */
  async function executeWithRetry<T>(
    operation: () => Promise<T>,
    config?: RetryConfig,
    context?: string
  ): Promise<RetryResult<T>> {
    return retryExecutor.executeWithRetry(operation, config, context);
  },

  /**
   * 带验证的交付物生成
   */
  async function generateArtifactWithValidation(
    artifactId: string,
    basePrompt: IterationAgentPrompt,
    agentRunner: any,
    maxAttempts?: number
  ): Promise<RetryResult<string>> {
    return retryExecutor.generateArtifactWithValidation(artifactId, basePrompt, agentRunner, maxAttempts);
  },

  /**
   * 补偿操作管理
   */
  addCompensation,
  executePendingCompensations,
  getPendingCompensations,
  clearCompensation
};
