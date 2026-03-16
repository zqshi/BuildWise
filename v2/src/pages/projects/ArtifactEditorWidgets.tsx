import { useEffect, useMemo, useRef, type ReactNode } from "react";
import MarkdownIt from "markdown-it";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-markup.js";
import "prismjs/components/prism-css.js";
import "prismjs/components/prism-javascript.js";
import "prismjs/components/prism-json.js";
import "prismjs/components/prism-markdown.js";
import "prismjs/components/prism-typescript.js";
import "prismjs/themes/prism-tomorrow.css";
import {
  buildEditorLineNumbers,
  detectCodeLanguage,
  detectDocumentFormat,
  normalizeRichTextContent,
  stripRichTextToPlainText,
  summarizeArtifactText
} from "./artifactEditorModel";

type ArtifactTextEditorProps = {
  title: string;
  value: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  actions?: ReactNode;
};

type ArtifactCodeViewerProps = {
  title: string;
  value: string;
  actions?: ReactNode;
};

const markdown = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true
});

function createMarkup(value: string) {
  const format = detectDocumentFormat(value);
  if (format === "html") {
    return normalizeRichTextContent(value);
  }
  return markdown.render(value.trim() ? value : "*暂无内容*");
}

export function ArtifactTextEditor({ title, value, readOnly = false, onChange, actions }: ArtifactTextEditorProps) {
  const documentFormat = useMemo(() => detectDocumentFormat(value), [value]);
  const normalizedContent = useMemo(() => normalizeRichTextContent(value), [value]);
  const plainText = useMemo(
    () => (documentFormat === "html" ? stripRichTextToPlainText(normalizedContent) : value.trim()),
    [documentFormat, normalizedContent, value]
  );
  const stats = useMemo(() => summarizeArtifactText(plainText), [plainText]);
  const markdownLineNumbers = useMemo(() => buildEditorLineNumbers(value), [value]);
  const markdownMarkup = useMemo(() => createMarkup(value), [value]);
  const editor = useEditor({
    extensions: [StarterKit],
    content: normalizedContent,
    editable: !readOnly && documentFormat === "html",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "artifact-rich-editor-content"
      }
    }
  });

  useEffect(() => {
    if (!editor || documentFormat !== "html") {
      return;
    }
    if (editor.getHTML() !== normalizedContent) {
      editor.commands.setContent(normalizedContent, { emitUpdate: false });
    }
  }, [documentFormat, editor, normalizedContent]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    editor.setEditable(!readOnly && documentFormat === "html");
  }, [documentFormat, editor, readOnly]);

  useEffect(() => {
    if (!editor || !onChange || readOnly || documentFormat !== "html") {
      return;
    }
    const handleUpdate = () => onChange(editor.getHTML());
    editor.on("update", handleUpdate);
    return () => {
      editor.off("update", handleUpdate);
    };
  }, [documentFormat, editor, onChange, readOnly]);

  return (
    <div className={`artifact-editor-shell ${readOnly ? "is-readonly" : ""}`}>
      <div className="artifact-editor-toolbar">
        <div className="artifact-editor-toolbar-block">
          <strong>{title}</strong>
          <span>{readOnly ? "只读交付物" : documentFormat === "html" ? "富文本编辑器" : "Markdown 编辑器"}</span>
        </div>
        <div className="artifact-editor-toolbar-block is-meta">
          <span>{documentFormat === "html" ? "rich-text" : "markdown"}</span>
          <span>{stats.lines} 行</span>
          <span>{stats.chars} 字符</span>
          <span>{stats.words} 词</span>
        </div>
        {actions ? <div className="artifact-editor-toolbar-actions">{actions}</div> : null}
      </div>
      {readOnly ? (
        <div className="artifact-markdown-preview" dangerouslySetInnerHTML={{ __html: markdownMarkup }} />
      ) : documentFormat === "html" ? (
        <div className="artifact-rich-editor">
          <EditorContent editor={editor} />
        </div>
      ) : (
        <div className="artifact-code-editor-shell artifact-markdown-editor-shell">
          <div className="artifact-editor-gutter" aria-hidden="true">
            {markdownLineNumbers.map((line) => (
              <span key={`markdown-line-${line}`}>{line}</span>
            ))}
          </div>
          <div className="artifact-code-editor-surface">
            <Editor
              value={value}
              onValueChange={(nextValue) => onChange?.(nextValue)}
              padding={16}
              textareaId="artifact-markdown-editor"
              textareaClassName="artifact-code-editor-textarea"
              preClassName="artifact-code-editor-pre language-markdown"
              highlight={(code) => Prism.highlight(code, Prism.languages.markdown, "markdown")}
              style={{
                fontFamily: "ui-monospace, SFMono-Regular, Consolas, Menlo, monospace",
                fontSize: 13,
                lineHeight: 1.6
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function ArtifactCodeViewer({ title, value, actions }: ArtifactCodeViewerProps) {
  const language = useMemo(() => detectCodeLanguage(title, value), [title, value]);
  const stats = useMemo(() => summarizeArtifactText(value), [value]);
  const lineNumbers = useMemo(() => buildEditorLineNumbers(value), [value]);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const grammar = Prism.languages[language] || Prism.languages.markup;

  useEffect(() => {
    const surface = surfaceRef.current;
    const gutter = gutterRef.current;
    if (!surface || !gutter) {
      return;
    }
    const textarea = surface.querySelector("textarea");
    if (!(textarea instanceof HTMLTextAreaElement)) {
      return;
    }
    const syncScroll = () => {
      gutter.scrollTop = textarea.scrollTop;
      gutter.scrollLeft = 0;
    };
    textarea.addEventListener("scroll", syncScroll);
    return () => textarea.removeEventListener("scroll", syncScroll);
  }, [value]);

  return (
    <div className="artifact-editor-shell is-code">
      <div className="artifact-editor-toolbar">
        <div className="artifact-editor-toolbar-block">
          <strong>{title}</strong>
          <span>代码编辑器视图</span>
        </div>
        <div className="artifact-editor-toolbar-block is-meta">
          <span>{language}</span>
          <span>{stats.lines} 行</span>
          <span>{stats.chars} 字符</span>
        </div>
        {actions ? <div className="artifact-editor-toolbar-actions">{actions}</div> : null}
      </div>
      <div className="artifact-code-editor-shell">
        <div ref={gutterRef} className="artifact-editor-gutter" aria-hidden="true">
          {lineNumbers.map((line) => (
            <span key={`line-${line}`}>{line}</span>
          ))}
        </div>
        <div ref={surfaceRef} className="artifact-code-editor-surface">
          <Editor
            value={value}
            onValueChange={() => undefined}
            readOnly
            padding={16}
            textareaId="artifact-code-editor"
            textareaClassName="artifact-code-editor-textarea"
            preClassName={`artifact-code-editor-pre language-${language}`}
            highlight={(code) => Prism.highlight(code, grammar, language)}
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace",
              fontSize: 13,
              lineHeight: 1.6
            }}
          />
        </div>
      </div>
    </div>
  );
}
