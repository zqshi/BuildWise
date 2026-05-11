import { KnowledgeNavTree } from "./KnowledgeNavTree";
import { KnowledgeEditor } from "./KnowledgeEditor";
import { useKnowledgeWorkspace } from "../../hooks/useKnowledgeWorkspace";

type KnowledgeWorkspaceViewProps = {
  projectId: number | null;
};

export function KnowledgeWorkspaceView({ projectId }: KnowledgeWorkspaceViewProps) {
  const workspace = useKnowledgeWorkspace(projectId);

  return (
    <div className="knowledge-workspace-view">
      <KnowledgeNavTree
        entries={workspace.entries}
        selectedId={workspace.selectedId}
        onSelect={workspace.selectEntry}
        onCreateEntry={workspace.createEntry}
        onCreateGroup={workspace.createGroup}
        expandedCategories={workspace.expandedCategories}
        onToggleCategory={workspace.toggleCategory}
      />
      <div className="knowledge-editor-pane">
        {workspace.selectedEntry ? (
          <KnowledgeEditor
            entry={workspace.selectedEntry}
            onSave={workspace.saveEntry}
            onPublish={workspace.publishEntry}
            onDelete={workspace.deleteEntry}
          />
        ) : (
          <div className="knowledge-editor-empty">
            <p className="hint">选择左侧条目开始编辑，或新建知识条目。</p>
          </div>
        )}
      </div>
    </div>
  );
}
