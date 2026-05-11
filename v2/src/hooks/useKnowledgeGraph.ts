import { useState, useCallback, useEffect } from "react";
import type { KnowledgeGraphCache } from "../domain/workspace/knowledgeGraphTypes";
import { fetchKnowledgeGraph, generateKnowledgeGraph } from "../app/workspaceApiKnowledge";

export function useKnowledgeGraph(projectId: number | null) {
  const [cache, setCache] = useState<KnowledgeGraphCache | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await fetchKnowledgeGraph(projectId);
      setCache(data?.graphData ? data : null);
      setError(null);
    } catch { setError("加载图谱失败"); }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const generate = useCallback(async () => {
    if (!projectId) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await generateKnowledgeGraph(projectId);
      setCache(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "生成失败";
      setError(msg.includes("503") || msg.includes("AI") ? "需要配置 AI 服务后才能生成知识图谱" : msg);
    }
    setGenerating(false);
  }, [projectId]);

  return { cache, loading, generating, error, generate, reload: load };
}
