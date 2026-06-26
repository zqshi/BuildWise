/**
 * AgentRegistry — 编码 Agent 适配器注册表
 *
 * 参照 arc `backend/src/arc/application/agent/registry.py` 的 AgentRegistry。
 *
 * 声明+运行时分离的运行时侧：业务层通过 create(type) 获取适配器实例，
 * 不直接 import 具体适配器实现。更换编码 agent 框架只需注册新 factory，
 * 业务层（codeRewrite 等）零改动。
 *
 * 注册入口（按配置动态注册仅 implemented 的适配器）在 V2.2 的 app bootstrap 建立；
 * V2.1 仅提供注册表机制 + 契约测试。
 */

import { isCodingAgentAvailable, type CodingAgentAdapter } from "../../domain/shared/codingAgent";

export type CodingAgentFactory = () => CodingAgentAdapter;

export class AgentRegistry {
  private readonly factories = new Map<string, CodingAgentFactory>();

  /** 注册一个编码 agent 工厂。type 为空抛错。同 type 重复注册覆盖旧值。 */
  register(type: string, factory: CodingAgentFactory): void {
    const normalized = type?.trim();
    if (!normalized) {
      throw new Error("Coding agent type must be a non-empty string.");
    }
    if (typeof factory !== "function") {
      throw new Error(`Coding agent factory for '${normalized}' must be a function.`);
    }
    this.factories.set(normalized, factory);
  }

  /** 创建指定类型的适配器实例。未注册或 implemented=false 抛错。 */
  create(type: string): CodingAgentAdapter {
    const factory = this.factories.get(type);
    if (!factory) {
      const available = this.availableAgents().join(", ") || "none";
      throw new Error(`Coding agent '${type}' is not registered. Available: ${available}.`);
    }
    const adapter = factory();
    if (!isCodingAgentAvailable(adapter)) {
      throw new Error(`Coding agent '${type}' is registered but not available (implemented=false or missing methods).`);
    }
    return adapter;
  }

  /** 列出已注册的 agent 类型（不创建实例，无副作用）。 */
  availableAgents(): string[] {
    return Array.from(this.factories.keys());
  }

  /** 是否注册了指定类型（不校验 implemented，仅查注册表）。 */
  isAvailable(type: string): boolean {
    return this.factories.has(type);
  }

  /** 清空注册表（测试用）。 */
  clear(): void {
    this.factories.clear();
  }
}
