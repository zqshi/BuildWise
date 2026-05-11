import { useState, useCallback, useEffect } from "react";
import type { BacklogItem } from "../domain/workspace/backlogTypes";
import { fetchBacklogItems, createBacklogItem, updateBacklogItem, deleteBacklogItem, assignBacklogItems } from "../app/workspaceApiBacklog";

type BacklogFilter = { status?: string; priority?: string; source?: string; iterationId?: string };

export function useBacklogState(projectId: number | null) {
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<BacklogFilter>({});

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filter.status) params.status = filter.status;
      if (filter.priority) params.priority = filter.priority;
      if (filter.source) params.source = filter.source;
      if (filter.iterationId !== undefined) params.iterationId = filter.iterationId;
      const data = await fetchBacklogItems(projectId, Object.keys(params).length > 0 ? params : undefined);
      setItems(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [projectId, filter]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (payload: { title: string; description?: string; priority?: string; source?: string; tags?: string[]; iterationId?: number | null }) => {
    if (!projectId) return null;
    const item = await createBacklogItem(projectId, payload);
    if (item) setItems((prev) => [item, ...prev]);
    return item;
  }, [projectId]);

  const update = useCallback(async (itemId: number, payload: Partial<BacklogItem>) => {
    if (!projectId) return null;
    const updated = await updateBacklogItem(projectId, itemId, payload);
    if (updated) setItems((prev) => prev.map((i) => i.id === itemId ? updated : i));
    return updated;
  }, [projectId]);

  const remove = useCallback(async (itemId: number) => {
    if (!projectId) return;
    await deleteBacklogItem(projectId, itemId);
    setItems((prev) => prev.filter((i) => i.id !== itemId));
  }, [projectId]);

  const assign = useCallback(async (itemIds: number[], iterationId: number | null) => {
    if (!projectId) return;
    await assignBacklogItems(projectId, itemIds, iterationId);
    await load();
  }, [projectId, load]);

  return { items, loading, filter, setFilter, create, update, remove, assign, reload: load };
}
