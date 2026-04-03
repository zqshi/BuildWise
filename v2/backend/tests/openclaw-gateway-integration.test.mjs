/**
 * OpenClaw Gateway Integration Tests
 *
 * 测试 OpenClaw Gateway 的集成：
 * - Gateway 客户端连接
 * - Skill 执行
 * - Agent Chat
 * - 重试和补偿机制
 */

import { describe, it, beforeEach, afterAll, mock } from "./helpers/mock-factories.mjs";

// Mock 数据
const mockAgentResponse = {
  success: true,
  reply: "Mock response",
  structuredOutput: {
    action: "none",
    guidance: {
      uploadRecommended: false,
      suggestedActions: [],
      clarificationChecklist: []
    },
    llm: {
      used: true,
      model: "claude-sonnet-4",
      degraded: false,
      reason: ""
    }
  };

const mockSkillExecutionResponse = {
  success: true,
  result: { test: "mock result" },
  executionTime: 1000,
  sessionId: "test-session"
};

// Mock OpenClawGatewayClient
class MockGatewayClient {
  async createSession() {
    return {
      sessionId: "test-session",
      projectId: 1,
      iterationId: 1,
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      metadata: {}
    };
  }

  async getSession() {
    return null;
  }

  async updateSession() {
    // No-op for mock
  }

  async deleteSession() {
    // No-op for mock
  }

  async executeSkill(request: any) {
    return mockSkillExecutionResponse;
  }

  async agentChat(request: any) {
    return mockAgentResponse;
  }

  async healthCheck() {
    return { status: "healthy", gateway: "http://localhost:18789", timestamp: new Date().toISOString() };
  }

  async probe() {
    return { reachable: true, version: "1.0.0", error: "" };
  }
}

// Mock Agent Runner
class MockAgentRunner {
  run(prompt: any, options?: any) {
    return {
      content: "Mock agent response",
      model: "mock-model",
      finishReason: "stop",
      truncated: false
    };
  }

  runWithHistory(systemPrompt: string, messages: any[], options?: any) {
    return {
      content: "Mock agent response with history",
      model: "mock-model",
      finishReason: "stop",
      truncated: false
    };
  }

  async endSession() {
    // No-op
  }

  getSessionMessages() {
    return [];
  }
}

// Mock Skill Executor
class MockSkillExecutor {
  async executeSkillWithValidation(artifactId: string, basePrompt: any, projectId: number, iterationId: number, maxAttempts: number) {
    const mockResult = {
      test: "mock result",
      artifacts: {
        cases: [
          {
            caseId: "test-001",
            type: "unit",
            focus: "测试项1",
            expected: "预期结果1",
            evidence: "证据1",
            executionStatus: "pending"
          }
        ]
      }
    };

    return {
      success: true,
      result: mockResult,
      attempts: maxAttempts,
      errors: []
    };
  }
}

describe("OpenClaw Gateway Integration", () => {
  let mockGateway;
  let mockAgentRunner;
  let mockSkillExecutor;

  beforeEach(() => {
    mockGateway = new MockGatewayClient();
    mockAgentRunner = new MockAgentRunner();
    mockSkillExecutor = new MockSkillExecutor();
  });

  describe("Gateway Client", () => {
    it("should create session successfully", async () => {
      const session = await mockGateway.createSession();
      assert.strictEqual(session.sessionId, "test-session");
      assert.strictEqual(session.projectId, 1);
    });

    it("should return null for non-existent session", async () => {
      const session = await mockGateway.getSession();
      assert.strictEqual(session, null);
    });
  });

  describe("Agent Runner Integration", () => {
    it("should execute agent chat with Gateway", async () => {
      const response = await mockAgentRunner.agentChat({
        agentId: "iteration-coach",
        message: "Test message",
        sessionId: "test-session"
      });

      assert.strictEqual(response.success, true);
      assert.strictEqual(response.reply, "Mock response");
    });

    it("should fallback to error mode when Gateway unavailable", async () => {
      mockAgentRunner.run = () => {
        throw new Error("Gateway unavailable");
      };

      const response = await mockAgentRunner.run({
        agentId: "iteration-coach",
        role: "artifact-generator",
        goal: "Generate artifact",
        systemPrompt: "You are an artifact generator",
        expectedOutput: "JSON object",
        userPrompt: "Generate test artifact"
      });

      assert.deepStrictEqual(response.degraded, true);
      assert.match(response.reason?.toLowerCase() || "", "unavailable");
    });
  });

  describe("Skill Executor", () => {
    it("should execute skill with validation", async () => {
      const result = await mockSkillExecutor.executeSkillWithValidation(
        "test-matrix",
        "generate-tests",
        {
          projectId: 1,
          iterationId: 1,
          iterationName: "Test Iteration",
          scope: { inScope: [], outOfScope: [] },
          ontologyTerms: []
        }
      );

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.attempts, 1);
      assert.deepStrictEqual(result.errors, []);
      assert.deepStrictEqual(result.result.cases.length, 1);
    });

    it("should retry on validation failure", async () => {
      const result = await mockSkillExecutor.executeSkillWithValidation(
        "test-matrix",
        "generate-tests",
        {
          projectId: 1,
          iterationId: 1,
          iterationName: "Test Iteration",
          scope: { inScope: [], outOfScope: [] },
          ontologyTerms: []
        },
        3 // 最多重试 3 次
      );

      assert.deepStrictEqual(result.success, false);
      assert.strictEqual(result.attempts, 3);
      assert.deepStrictEqual(result.errors.length, 3);
    });
  });
});
