import { useState, useEffect, useCallback, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import Typography from "@tiptap/extension-typography";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import type { KnowledgeEntry } from "../../domain/workspace/knowledgeTypes";
import { KnowledgeEditorToolbar } from "./KnowledgeEditorToolbar";

const lowlight = createLowlight(common);

type KnowledgeEditorProps = {
  entry: KnowledgeEntry;
  onSave: (entryId: number, payload: Partial<KnowledgeEntry>) => Promise<void>;
  onPublish: (entryId: number) => Promise<void>;
  onDelete: (entryId: number) => Promise<void>;
};

const SOURCE_LABELS: Record<string, string> = { manual: "手动", analysis: "分析报告", coach: "教练对话", "iteration-review": "迭代复盘" };
const STATUS_LABELS: Record<string, string> = { draft: "草稿", published: "已发布", archived: "已归档" };

const EXTENSIONS = [
  StarterKit.configure({ codeBlock: false }),
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
  TaskList,
  TaskItem.configure({ nested: true }),
  Highlight,
  Placeholder.configure({ placeholder: "开始编写知识内容..." }),
  Typography,
  CodeBlockLowlight.configure({ lowlight }),
];

export function KnowledgeEditor({ entry, onSave, onPublish, onDelete }: KnowledgeEditorProps) {
  const [title, setTitle] = useState(entry.title);
  const [dirty, setDirty] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAgent = entry.source !== "manual";

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: entry.content,
    immediatelyRender: false,
    editorProps: { attributes: { class: "knowledge-rich-editor-content" } },
    onUpdate: ({ editor: ed }) => {
      setDirty(true);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        onSave(entry.id, { content: ed.getHTML() });
        setDirty(false);
      }, 800);
    }
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== entry.content) {
      editor.commands.setContent(entry.content, { emitUpdate: false });
    }
  }, [entry.id, entry.content, editor]);

  useEffect(() => { setTitle(entry.title); }, [entry.id, entry.title]);

  const handleTitleBlur = useCallback(() => {
    if (title.trim() && title !== entry.title) {
      onSave(entry.id, { title: title.trim() });
    }
  }, [title, entry.id, entry.title, onSave]);

  const handleManualSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const content = editor?.getHTML() || entry.content;
    onSave(entry.id, { title: title.trim() || entry.title, content });
    setDirty(false);
  }, [editor, entry, title, onSave]);

  const handleDelete = useCallback(async () => {
    const confirmed = window.confirm(`确认删除知识条目「${entry.title}」？`);
    if (confirmed) await onDelete(entry.id);
  }, [entry, onDelete]);

  return (
    <>
      <div className="knowledge-editor-header">
        <input
          type="text"
          className="knowledge-editor-title"
          value={title}
          onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          onBlur={handleTitleBlur}
          placeholder="知识标题"
        />
        <div className="knowledge-editor-meta">
          {isAgent ? (
            <span className="knowledge-agent-badge">
              <svg className="knowledge-agent-icon" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.5 4.5H14l-3.5 2.8 1.3 4.2L8 10.2 4.2 13l1.3-4.2L2 6h4.5L8 1.5z" fill="currentColor" /></svg>
              Agent
            </span>
          ) : null}
          <span className={`status-pill ${entry.status}`}>{STATUS_LABELS[entry.status] || entry.status}</span>
          <span className="knowledge-editor-source">{SOURCE_LABELS[entry.source] || entry.source}</span>
          {entry.groupName ? <span className="knowledge-editor-group">{entry.groupName}</span> : null}
          {dirty ? <span className="knowledge-editor-dirty">未保存</span> : null}
        </div>
        <KnowledgeEditorToolbar editor={editor} />
      </div>
      <div className="knowledge-editor-body">
        <EditorContent editor={editor} />
      </div>
      <div className="knowledge-editor-footer">
        <button type="button" className="btn primary mini" onClick={handleManualSave}>保存</button>
        {entry.status === "draft" ? <button type="button" className="btn ghost mini" onClick={() => onPublish(entry.id)}>发布</button> : null}
        {entry.status === "published" ? <button type="button" className="btn ghost mini" onClick={() => onSave(entry.id, { status: "archived" })}>归档</button> : null}
        <button type="button" className="btn ghost mini" style={{ color: "var(--danger-500)" }} onClick={handleDelete}>删除</button>
      </div>
    </>
  );
}
