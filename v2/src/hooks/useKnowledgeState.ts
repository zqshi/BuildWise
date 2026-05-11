import { useState, useCallback, useEffect } from "react";
import type { KnowledgeEntry } from "../domain/workspace/knowledgeTypes";
import { fetchKnowledgeEntries, createKnowledgeEntry, updateKnowledgeEntry, deleteKnowledgeEntry, publishKnowledgeEntry, searchKnowledgeEntries } from "../app/workspaceApiKnowledge";

type KnowledgeFilter = { category?: string; status?: string; q?: string };

export function useKnowledgeState(projectId: number | null) {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<KnowledgeFilter>({});

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filter.category) params.category = filter.category;
      if (filter.status) params.status = filter.status;
      if (filter.q) params.q = filter.q;
      const data = await fetchKnowledgeEntries(projectId, Object.keys(params).length > 0 ? params : undefined);
      setEntries(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [projectId, filter]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (payload: { title: string; content: string; category: string; applicableScene?: string; tags?: string[]; source?: string; iterationId?: number | null }) => {
    if (!projectId) return null;
    const entry = await createKnowledgeEntry(projectId, payload);
    if (entry) setEntries((prev) => [entry, ...prev]);
    return entry;
  }, [projectId]);

  const update = useCallback(async (entryId: number, payload: Partial<KnowledgeEntry>) => {
    if (!projectId) return null;
    const updated = await updateKnowledgeEntry(projectId, entryId, payload);
    if (updated) setEntries((prev) => prev.map((e) => e.id === entryId ? updated : e));
    return updated;
  }, [projectId]);

  const remove = useCallback(async (entryId: number) => {
    if (!projectId) return;
    await deleteKnowledgeEntry(projectId, entryId);
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }, [projectId]);

  const publish = useCallback(async (entryId: number) => {
    if (!projectId) return null;
    const published = await publishKnowledgeEntry(projectId, entryId);
    if (published) setEntries((prev) => prev.map((e) => e.id === entryId ? published : e));
    return published;
  }, [projectId]);

  const search = useCallback(async (query: string) => {
    if (!projectId || !query.trim()) return [];
    return searchKnowledgeEntries(projectId, query.trim());
  }, [projectId]);

  return { entries, loading, filter, setFilter, create, update, remove, publish, search, reload: load };
}
