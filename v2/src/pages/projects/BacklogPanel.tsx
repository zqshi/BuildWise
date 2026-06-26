import { useState } from "react";
import type { DragEvent } from "react";
import type { BacklogItem } from "../../domain/workspace/backlogTypes";
import type { Iteration } from "../../domain/workspace/types";
import { useBacklogState } from "../../hooks/useBacklogState";
import { groupBacklogByIteration } from "../../domain/workspace/backlogGrouping";

type BacklogPanelProps = {
  projectId: number | null;
  iterations: Iteration[];
};

const PRIORITY_LABELS: Record<string, string> = { critical: "紧急", high: "高", medium: "中", low: "低" };
const STATUS_LABELS: Record<string, string> = { open: "待规划", planned: "已排期", "in-progress": "进行中", done: "已完成", cancelled: "已取消" };
const SOURCE_LABELS: Record<string, string> = { customer: "客户", internal: "内部", analysis: "分析报告", coach: "教练对话" };

/** 拖拽传输的需求 id MIME，避免与文件上传拖拽混淆 */
const DRAG_MIME = "text/backlog-item-id";

type DropZoneKey = number | "unassigned";

export function BacklogPanel({ projectId, iterations }: BacklogPanelProps) {
  const { items, loading, filter, setFilter, create, remove, assign } = useBacklogState(projectId);
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newSource, setNewSource] = useState("internal");
  // 默认版本分组视图：归属后需求自动归入版本组，视觉即时闭环
  const [viewMode, setViewMode] = useState<"list" | "version">("version");
  // 拖拽高亮区：number=版本组 id，"unassigned"=未分配组，null=未拖入
  const [dragOverZone, setDragOverZone] = useState<DropZoneKey | null>(null);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await create({ title: newTitle.trim(), priority: newPriority, source: newSource });
    setNewTitle("");
    setShowCreate(false);
  };

  const handleAssign = async (item: BacklogItem, iterationId: number | null) => {
    await assign([item.id], iterationId);
  };

  // 版本组/未分配组作为 drop zone：拖入需求即归属到该版本（未分配=移回需求池）
  const dropHandlers = (zoneKey: DropZoneKey, iterationId: number | null) => ({
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverZone(zoneKey);
    },
    onDragLeave: (e: DragEvent<HTMLDivElement>) => {
      // 仅当真正离开整个组容器时清除高亮（子元素切换不触发）
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        setDragOverZone((z) => (z === zoneKey ? null : z));
      }
    },
    onDrop: async (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOverZone(null);
      const raw = e.dataTransfer.getData(DRAG_MIME);
      const id = Number(raw);
      if (raw && !Number.isNaN(id)) {
        await assign([id], iterationId);
      }
    },
  });

  const grouping = groupBacklogByIteration(items, iterations);

  return (
    <section className="backlog-panel">
      <div className="panel-head tight">
        <h3>需求池</h3>
        <div className="chat-tools">
          <button type="button" className={`btn ghost mini ${viewMode === "list" ? "active" : ""}`} onClick={() => setViewMode("list")}>列表</button>
          <button type="button" className={`btn ghost mini ${viewMode === "version" ? "active" : ""}`} onClick={() => setViewMode("version")}>版本</button>
          <button type="button" className="btn ghost mini" onClick={() => setShowCreate(true)}>新建</button>
        </div>
      </div>

      <div className="backlog-filters">
        <select value={filter.status || ""} onChange={(e) => setFilter({ ...filter, status: e.target.value || undefined })}>
          <option value="">全部状态</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filter.priority || ""} onChange={(e) => setFilter({ ...filter, priority: e.target.value || undefined })}>
          <option value="">全部优先级</option>
          {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filter.source || ""} onChange={(e) => setFilter({ ...filter, source: e.target.value || undefined })}>
          <option value="">全部来源</option>
          {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {showCreate ? (
        <div className="backlog-create-form">
          <input type="text" placeholder="需求标题" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }} />
          <div className="backlog-create-row">
            <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)}>
              {Object.entries(PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <select value={newSource} onChange={(e) => setNewSource(e.target.value)}>
              {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button type="button" className="btn primary mini" onClick={handleCreate}>确认</button>
            <button type="button" className="btn ghost mini" onClick={() => setShowCreate(false)}>取消</button>
          </div>
        </div>
      ) : null}

      {loading ? <p className="hint">加载中...</p> : null}
      {viewMode === "version" && !loading && items.length === 0 ? <p className="hint">暂无需求条目，点击「新建」添加</p> : null}

      {viewMode === "list" ? (
        <div className="backlog-list">
          {items.map((item) => (
            <BacklogItemRow key={item.id} item={item} iterations={iterations} onDelete={remove} onAssign={handleAssign} />
          ))}
        </div>
      ) : (
        <div className="backlog-version-view">
          <div
            className={`backlog-version-group ${dragOverZone === "unassigned" ? "drop-active" : ""}`}
            {...dropHandlers("unassigned", null)}
          >
            <h4>未分配 <span className="count-badge">{grouping.unassigned.length}</span></h4>
            {grouping.unassigned.length === 0 ? <p className="hint zone-hint">将需求拖到下方版本组进行归属</p> : null}
            {grouping.unassigned.map((item) => (
              <BacklogItemRow key={item.id} item={item} iterations={iterations} onDelete={remove} onAssign={handleAssign} />
            ))}
          </div>
          {grouping.groups.map((g) => (
            <div
              key={g.iteration.id}
              className={`backlog-version-group ${dragOverZone === g.iteration.id ? "drop-active" : ""}`}
              {...dropHandlers(g.iteration.id, g.iteration.id)}
            >
              <h4>{g.iteration.version || g.iteration.name} <span className="count-badge">{g.items.length}</span></h4>
              {g.items.map((item) => (
                <BacklogItemRow key={item.id} item={item} iterations={iterations} onDelete={remove} onAssign={handleAssign} />
              ))}
            </div>
          ))}
          {grouping.groups.length === 0 && grouping.unassigned.length === 0 && !loading ? null : null}
        </div>
      )}
    </section>
  );
}

function BacklogItemRow({ item, iterations, onDelete, onAssign }: {
  item: BacklogItem;
  iterations: Iteration[];
  onDelete: (id: number) => Promise<void>;
  onAssign: (item: BacklogItem, iterationId: number | null) => Promise<void>;
}) {
  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData(DRAG_MIME, String(item.id));
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="backlog-item-row" draggable onDragStart={handleDragStart}>
      <span className={`priority-badge ${item.priority}`}>{PRIORITY_LABELS[item.priority] || item.priority}</span>
      <span className="backlog-item-title">{item.title}</span>
      <span className={`status-pill ${item.status}`}>{STATUS_LABELS[item.status] || item.status}</span>
      <span className="backlog-item-source">{SOURCE_LABELS[item.source] || item.source}</span>
      <select
        className="backlog-assign-select"
        value={item.iterationId ?? ""}
        onChange={(e) => {
          const val = e.target.value;
          onAssign(item, val ? Number(val) : null);
        }}
      >
        <option value="">未分配</option>
        {iterations.map((iter) => <option key={iter.id} value={iter.id}>{iter.version || iter.name}</option>)}
      </select>
      <button type="button" className="btn ghost mini" onClick={() => onDelete(item.id)} title="删除">✕</button>
    </div>
  );
}
