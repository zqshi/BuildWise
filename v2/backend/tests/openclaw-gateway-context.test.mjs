import test from "node:test";
import assert from "node:assert/strict";

const { buildGatewayProjectContext } = await import(
  "../dist/application/workspace/openclawService.js"
);

test("gateway context includes project name and description", () => {
  const context = buildGatewayProjectContext({
    project: { name: "电商平台", description: "B2C电商", status: "active", knowledgeBase: null },
    userMessage: "你好",
    binding: null
  });
  assert.ok(context.includes("电商平台"));
});

test("gateway context includes KB terms when available", () => {
  const context = buildGatewayProjectContext({
    project: {
      name: "电商",
      description: "",
      status: "active",
      knowledgeBase: {
        ontologyTerms: [{ term: "订单", aliases: ["Order"], definition: "核心实体", evidence: "" }],
        stableRules: [{ rule: "未支付30分钟取消", rationale: "", source: "" }],
        componentInventory: [{ component: "OrderList", responsibility: "列表", relatedRequirements: [], relatedCodePaths: [] }],
        codeMap: [],
        decisionLog: [],
        knownRisks: [],
        changePatterns: [],
        updatedAt: ""
      }
    },
    userMessage: "看看项目",
    binding: null
  });
  assert.ok(context.includes("订单"), "should include ontology terms");
  assert.ok(context.includes("未支付30分钟取消"), "should include stable rules");
  assert.ok(context.includes("OrderList"), "should include components");
});

test("gateway context includes binding info when available", () => {
  const context = buildGatewayProjectContext({
    project: { name: "P", description: "", status: "active", knowledgeBase: null },
    userMessage: "hi",
    binding: {
      openclawProfile: "project-1",
      agentId: "buildwise-agent",
      workspacePath: "/ws/project-1"
    }
  });
  assert.ok(context.includes("buildwise-agent") || context.includes("project-1"));
});

test("gateway context works without project", () => {
  const context = buildGatewayProjectContext({
    project: null,
    userMessage: "hello",
    binding: null
  });
  assert.ok(typeof context === "string");
});
