import { useMemo, useState } from "react";
import type { KnowledgeEntry, KnowledgeCategory } from "../../domain/workspace/knowledgeTypes";

type KnowledgeNavTreeProps = {
  entries: KnowledgeEntry[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onCreateEntry: (category: KnowledgeCategory, groupName: string, title: string) => void;
  onCreateGroup: (category: KnowledgeCategory, groupName: string) => void;
  expandedCategories: Set<string>;
  onToggleCategory: (cat: string) => void;
};

const CATEGORY_LABELS: Record<string, string> = {
  "technical": "技术方案",
  "business-rule": "业务规则",
  "pitfall": "踩坑记录",
  "architecture-decision": "架构决策",
  "customer-experience": "客户经验"
};

const CATEGORIES: KnowledgeCategory[] = ["technical", "business-rule", "pitfall", "architecture-decision", "customer-experience"];

export function KnowledgeNavTree({ entries, selectedId, onSelect, onCreateEntry, onCreateGroup, expandedCategories, onToggleCategory }: KnowledgeNavTreeProps) {
  const [addingGroupFor, setAddingGroupFor] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");

  const tree = useMemo(() => {
    return CATEGORIES.map((cat) => {
      const catEntries = entries.filter((e) => e.category === cat);
      const groups = new Map<string, KnowledgeEntry[]>();
      for (const entry of catEntries) {
        const gn = entry.groupName || "";
        if (!groups.has(gn)) groups.set(gn, []);
        groups.get(gn)?.push(entry);
      }
      return { category: cat, label: CATEGORY_LABELS[cat] || cat, groups, count: catEntries.length };
    });
  }, [entries]);

  const handleAddGroup = (cat: KnowledgeCategory) => {
    if (!newGroupName.trim()) return;
    onCreateGroup(cat, newGroupName.trim());
    setNewGroupName("");
    setAddingGroupFor(null);
  };

  return (
    <nav className="knowledge-nav-tree">
      {tree.map((node) => (
        <div key={node.category} className="knowledge-nav-category">
          <div className="knowledge-nav-category-head" onClick={() => onToggleCategory(node.category)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onToggleCategory(node.category); }}>
            <span className="knowledge-nav-chevron">{expandedCategories.has(node.category) ? "▾" : "▸"}</span>
            <span className="knowledge-nav-category-label">{node.label}</span>
            <span className="knowledge-nav-count">{node.count}</span>
            <button type="button" className="knowledge-nav-add" title="新建条目" onClick={(e) => { e.stopPropagation(); onCreateEntry(node.category, "", "新建知识"); }}>+</button>
          </div>
          {expandedCategories.has(node.category) ? (
            <div className="knowledge-nav-category-body">
              {[...node.groups.entries()].map(([groupName, groupEntries]) => (
                <div key={groupName || "__ungrouped"} className="knowledge-nav-group">
                  {groupName ? <div className="knowledge-nav-group-label">{groupName}</div> : null}
                  {groupEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className={`knowledge-nav-item ${entry.id === selectedId ? "active" : ""}`}
                      onClick={() => onSelect(entry.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === "Enter") onSelect(entry.id); }}
                    >
                      {entry.source !== "manual" ? (
                        <svg className="knowledge-agent-icon" viewBox="0 0 16 16" fill="none" aria-label="Agent">
                          <path d="M8 1.5l1.5 4.5H14l-3.5 2.8 1.3 4.2L8 10.2 4.2 13l1.3-4.2L2 6h4.5L8 1.5z" fill="currentColor" />
                        </svg>
                      ) : null}
                      <span className="knowledge-nav-item-title">{entry.title}</span>
                    </div>
                  ))}
                </div>
              ))}
              {addingGroupFor === node.category ? (
                <div className="knowledge-nav-new-group">
                  <input
                    type="text"
                    placeholder="分组名称"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddGroup(node.category); if (e.key === "Escape") setAddingGroupFor(null); }}
                  />
                </div>
              ) : (
                <button type="button" className="knowledge-nav-add-group" onClick={() => setAddingGroupFor(node.category)}>+ 新建分组</button>
              )}
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}
