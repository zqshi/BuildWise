import type { AgentRunner } from '../shared/agentRunner';
import type { KnowledgeEntry } from '../../../domain/workspace/knowledgeTypes';
import type { KnowledgeGraphData, KnowledgeGraphNode, KnowledgeGraphEdge } from '../../../domain/workspace/knowledgeGraphTypes';
import type { IterationAgentPrompt } from '../../../domain/workspace/analysisTypes';
import { LlmUnavailableError } from '../shared/agentRunner';

function buildGraphPrompt(entries: KnowledgeEntry[]): IterationAgentPrompt {
  const entrySummaries = entries.map((e) =>
    `[ID:${e.id}] 分类:${e.category} 分组:${e.groupName || "无"} 标题:${e.title}\n内容:${e.content.slice(0, 500)}${e.applicableScene ? `\n适用场景:${e.applicableScene}` : ""}${e.tags.length > 0 ? `\n标签:${e.tags.join(",")}` : ""}`
  ).join("\n---\n");

  return {
    agentId: "knowledge-graph-generator",
    role: "solution-architect",
    scope: "iteration",
    goal: "从项目知识库内容中提取概念关系图谱",
    systemPrompt: `你是一位知识图谱构建专家。你需要从给定的项目知识条目中：
1. 提取核心概念/实体节点（最多30个），每个节点标注类型：concept(概念)、entity(实体)、pattern(模式)、rule(规则)
2. 识别节点间的关系，类型：depends_on(依赖)、extends(扩展)、contradicts(矛盾)、related(相关)
3. 生成一段整体知识覆盖摘要（2-3句话，中文）
4. 提炼3-5条关键洞察（中文，如覆盖薄弱点、知识冲突、沉淀热点）

输出必须是严格JSON，结构如下：
{
  "nodes": [{"id":"n1","label":"连接池","type":"concept","entryIds":[1,3]}],
  "edges": [{"id":"e1","from":"n1","to":"n2","relation":"depends_on","label":"连接池依赖数据库配置"}],
  "summary": "整体摘要文本",
  "insights": ["洞察1","洞察2"]
}

只输出JSON，不要包含任何额外文字。`,
    userPrompt: `以下是项目知识库的全部条目（共${entries.length}条）：\n\n${entrySummaries}`,
    expectedOutput: "json"
  };
}

function calculateLayout(nodes: KnowledgeGraphNode[], edges: KnowledgeGraphEdge[]): { nodes: KnowledgeGraphNode[]; maxDegree: number } {
  const degreeMap = new Map<string, number>();
  for (const edge of edges) {
    degreeMap.set(edge.from, (degreeMap.get(edge.from) || 0) + 1);
    degreeMap.set(edge.to, (degreeMap.get(edge.to) || 0) + 1);
  }
  const maxDegree = Math.max(1, ...degreeMap.values());
  const total = nodes.length;
  const positioned = nodes.map((node, idx) => {
    const angle = (Math.PI * 2 * idx) / total - Math.PI / 2;
    const radius = Math.min(40, Math.max(26, 44 - Math.log2(total + 1) * 4));
    return { ...node, x: 50 + Math.cos(angle) * radius, y: 50 + Math.sin(angle) * radius };
  });
  return { nodes: positioned, maxDegree };
}

function parseGraphResponse(content: string): KnowledgeGraphData | null {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    const nodes: KnowledgeGraphNode[] = parsed.nodes.slice(0, 30).map((n: Record<string, unknown>, i: number) => ({
      id: String(n.id || `n${i}`),
      label: String(n.label || ""),
      type: ["concept", "entity", "pattern", "rule"].includes(String(n.type)) ? n.type : "concept",
      entryIds: Array.isArray(n.entryIds) ? n.entryIds.map(Number) : [],
      x: 0, y: 0,
    }));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges: KnowledgeGraphEdge[] = (parsed.edges as Record<string, unknown>[])
      .filter((e) => nodeIds.has(String(e.from)) && nodeIds.has(String(e.to)))
      .map((e, i) => ({
        id: String(e.id || `e${i}`),
        from: String(e.from),
        to: String(e.to),
        relation: ["depends_on", "extends", "contradicts", "related"].includes(String(e.relation)) ? String(e.relation) as KnowledgeGraphEdge["relation"] : "related",
        label: String(e.label || ""),
      }));
    const { nodes: positioned, maxDegree } = calculateLayout(nodes, edges);
    return {
      nodes: positioned,
      edges,
      summary: String(parsed.summary || ""),
      insights: Array.isArray(parsed.insights) ? parsed.insights.map(String).slice(0, 5) : [],
      maxDegree,
    };
  } catch {
    return null;
  }
}

export async function generateKnowledgeGraph(
  agentRunner: AgentRunner | null,
  entries: KnowledgeEntry[]
): Promise<KnowledgeGraphData> {
  if (!agentRunner) throw new LlmUnavailableError("知识图谱生成需要 AI 服务支持");
  if (entries.length === 0) {
    return { nodes: [], edges: [], summary: "暂无知识条目", insights: [], maxDegree: 0 };
  }
  const prompt = buildGraphPrompt(entries);
  const result = await agentRunner.run(prompt);
  const graph = parseGraphResponse(result.content);
  if (!graph) {
    const repairPrompt: IterationAgentPrompt = {
      ...prompt,
      userPrompt: `上一次的输出格式错误，请严格输出JSON。原始输出片段：${result.content.slice(0, 200)}\n\n请重新生成，只输出JSON。`
    };
    const retryResult = await agentRunner.run(repairPrompt);
    const retryGraph = parseGraphResponse(retryResult.content);
    if (!retryGraph) {
      return { nodes: [], edges: [], summary: "图谱生成失败，请重试", insights: [], maxDegree: 0 };
    }
    return retryGraph;
  }
  return graph;
}
