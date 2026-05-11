import { useState, useCallback, useEffect, useMemo } from "react";
import type { KnowledgeEntry, KnowledgeCategory } from "../domain/workspace/knowledgeTypes";
import { fetchKnowledgeEntries, createKnowledgeEntry, updateKnowledgeEntry, deleteKnowledgeEntry, publishKnowledgeEntry } from "../app/workspaceApiKnowledge";

export function useKnowledgeWorkspace(projectId: number | null) {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(["technical"]));

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const data = await fetchKnowledgeEntries(projectId);
      setEntries(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId]
  );

  const selectEntry = useCallback((id: number | null) => { setSelectedId(id); }, []);

  const toggleCategory = useCallback((cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }, []);

  const createEntry = useCallback(async (category: KnowledgeCategory, groupName: string, title: string) => {
    if (!projectId) return;
    const entry = await createKnowledgeEntry(projectId, { title, content: "", category, groupName });
    if (entry) {
      setEntries((prev) => [entry, ...prev]);
      setSelectedId(entry.id);
    }
  }, [projectId]);

  const createGroup = useCallback(async (category: KnowledgeCategory, groupName: string) => {
    if (!projectId) return;
    const entry = await createKnowledgeEntry(projectId, { title: "新建知识", content: "", category, groupName });
    if (entry) {
      setEntries((prev) => [entry, ...prev]);
      setSelectedId(entry.id);
      setExpandedCategories((prev) => new Set([...prev, category]));
    }
  }, [projectId]);

  const saveEntry = useCallback(async (entryId: number, payload: Partial<KnowledgeEntry>) => {
    if (!projectId) return;
    const updated = await updateKnowledgeEntry(projectId, entryId, payload);
    if (updated) setEntries((prev) => prev.map((e) => e.id === entryId ? updated : e));
  }, [projectId]);

  const publishEntry = useCallback(async (entryId: number) => {
    if (!projectId) return;
    const published = await publishKnowledgeEntry(projectId, entryId);
    if (published) setEntries((prev) => prev.map((e) => e.id === entryId ? published : e));
  }, [projectId]);

  const deleteEntry = useCallback(async (entryId: number) => {
    if (!projectId) return;
    await deleteKnowledgeEntry(projectId, entryId);
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    if (selectedId === entryId) setSelectedId(null);
  }, [projectId, selectedId]);

  return {
    entries,
    loading,
    selectedId,
    selectedEntry,
    expandedCategories,
    selectEntry,
    toggleCategory,
    createEntry,
    createGroup,
    saveEntry,
    publishEntry,
    deleteEntry,
    reload: load
  };
}
