import type { Editor } from "@tiptap/react";

type ToolbarProps = { editor: Editor | null };

type ToolBtn = { label: string; icon: string; action: (e: Editor) => void; isActive?: (e: Editor) => boolean };

const TEXT_TOOLS: ToolBtn[] = [
  { label: "粗体", icon: "B", action: (e) => e.chain().focus().toggleBold().run(), isActive: (e) => e.isActive("bold") },
  { label: "斜体", icon: "I", action: (e) => e.chain().focus().toggleItalic().run(), isActive: (e) => e.isActive("italic") },
  { label: "删除线", icon: "S", action: (e) => e.chain().focus().toggleStrike().run(), isActive: (e) => e.isActive("strike") },
  { label: "行内代码", icon: "<>", action: (e) => e.chain().focus().toggleCode().run(), isActive: (e) => e.isActive("code") },
  { label: "高亮", icon: "H", action: (e) => e.chain().focus().toggleHighlight().run(), isActive: (e) => e.isActive("highlight") },
];

const BLOCK_TOOLS: ToolBtn[] = [
  { label: "标题1", icon: "H1", action: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), isActive: (e) => e.isActive("heading", { level: 1 }) },
  { label: "标题2", icon: "H2", action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), isActive: (e) => e.isActive("heading", { level: 2 }) },
  { label: "标题3", icon: "H3", action: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), isActive: (e) => e.isActive("heading", { level: 3 }) },
  { label: "无序列表", icon: "•", action: (e) => e.chain().focus().toggleBulletList().run(), isActive: (e) => e.isActive("bulletList") },
  { label: "有序列表", icon: "1.", action: (e) => e.chain().focus().toggleOrderedList().run(), isActive: (e) => e.isActive("orderedList") },
  { label: "任务列表", icon: "☑", action: (e) => e.chain().focus().toggleTaskList().run(), isActive: (e) => e.isActive("taskList") },
  { label: "引用", icon: "❝", action: (e) => e.chain().focus().toggleBlockquote().run(), isActive: (e) => e.isActive("blockquote") },
  { label: "代码块", icon: "{ }", action: (e) => e.chain().focus().toggleCodeBlock().run(), isActive: (e) => e.isActive("codeBlock") },
];

const TABLE_TOOLS: ToolBtn[] = [
  { label: "插入表格", icon: "⊞", action: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { label: "添加行", icon: "+行", action: (e) => e.chain().focus().addRowAfter().run() },
  { label: "添加列", icon: "+列", action: (e) => e.chain().focus().addColumnAfter().run() },
  { label: "删除表格", icon: "⊟", action: (e) => e.chain().focus().deleteTable().run() },
];

const ACTION_TOOLS: ToolBtn[] = [
  { label: "撤销", icon: "↩", action: (e) => e.chain().focus().undo().run() },
  { label: "重做", icon: "↪", action: (e) => e.chain().focus().redo().run() },
];

function ToolGroup({ tools, editor }: { tools: ToolBtn[]; editor: Editor }) {
  return (
    <span className="knowledge-toolbar-group">
      {tools.map((t) => (
        <button
          key={t.label}
          type="button"
          className={`knowledge-toolbar-btn ${t.isActive?.(editor) ? "active" : ""}`}
          title={t.label}
          onMouseDown={(ev) => { ev.preventDefault(); t.action(editor); }}
        >
          {t.icon}
        </button>
      ))}
    </span>
  );
}

export function KnowledgeEditorToolbar({ editor }: ToolbarProps) {
  if (!editor) return null;
  return (
    <div className="knowledge-editor-toolbar">
      <ToolGroup tools={TEXT_TOOLS} editor={editor} />
      <ToolGroup tools={BLOCK_TOOLS} editor={editor} />
      <ToolGroup tools={TABLE_TOOLS} editor={editor} />
      <ToolGroup tools={ACTION_TOOLS} editor={editor} />
    </div>
  );
}
