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
  type ArtifactDocumentProfile,
  type ArtifactMarkdownCodeBlock,
  type ArtifactMarkdownTable,
  buildEditorLineNumbers,
  detectCodeLanguage,
  detectDocumentFormat,
  extractArtifactMarkdownCodeBlocks,
  extractArtifactMarkdownTables,
  extractArtifactOutlineSections,
  extractArtifactDocumentContent,
  normalizeMarkdownForPreview,
  normalizeRichTextContent,
  stripRichTextToPlainText,
  summarizeArtifactStructure,
  summarizeArtifactText
} from "./artifactEditorModel";

type ArtifactTextEditorProps = {
  title: string;
  value: string;
  profile?: ArtifactDocumentProfile;
  readOnly?: boolean;
  showTitle?: boolean;
  onChange?: (value: string) => void;
  actions?: ReactNode;
};

type ArtifactCodeViewerProps = {
  title: string;
  value: string;
  actions?: ReactNode;
};

const markdown = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true
});

const OVERVIEW_ENABLED_PROFILES = new Set<ArtifactDocumentProfile>([
  "design-spec",
  "technical-architecture",
  "test-cases",
  "release-review",
  "delivery-package"
]);

function renderSectionOutline(title: string, sections: ReturnType<typeof extractArtifactOutlineSections>) {
  if (sections.length === 0) {
    return null;
  }
  return (
    <section className="deliverable-section artifact-profile-section">
      <h4>{title}</h4>
      <ul className="history-list">
        {sections.map((section, index) => (
          <li key={`${title}-${section.title}-${index}`} className="history-item">
            <strong>{section.title}</strong>
            {section.summary ? <p>{section.summary}</p> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function renderCodeBlockCards(title: string, blocks: ArtifactMarkdownCodeBlock[]) {
  if (blocks.length === 0) {
    return null;
  }
  return (
    <section className="deliverable-section artifact-profile-section">
      <h4>{title}</h4>
      <div className="artifact-profile-code-list">
        {blocks.map((block, index) => (
          <article key={`${block.language}-${index}`} className="artifact-profile-code-card">
            <span>{block.language}</span>
            <pre>{block.preview}</pre>
          </article>
        ))}
      </div>
    </section>
  );
}

function renderTablePreview(title: string, tables: ArtifactMarkdownTable[]) {
  if (tables.length === 0) {
    return null;
  }
  return (
    <section className="deliverable-section artifact-profile-section">
      <h4>{title}</h4>
      <div className="artifact-profile-table-list">
        {tables.map((table, tableIndex) => (
          <div key={`${title}-table-${tableIndex}`} className="artifact-profile-table-card">
            <div className="artifact-profile-table-head">
              {table.headers.map((header, headerIndex) => (
                <strong key={`${header}-${headerIndex}`}>{header || `列${headerIndex + 1}`}</strong>
              ))}
            </div>
            {table.rows.slice(0, 4).map((row, rowIndex) => (
              <div key={`${title}-row-${rowIndex}`} className="artifact-profile-table-row">
                {table.headers.map((header, columnIndex) => (
                  <div key={`${header}-${columnIndex}`}>
                    <span>{header || `列${columnIndex + 1}`}</span>
                    <p>{row[columnIndex] || "-"}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function renderProfileOverview(
  profile: ArtifactDocumentProfile,
  outlineSections: ReturnType<typeof extractArtifactOutlineSections>,
  codeBlocks: ArtifactMarkdownCodeBlock[],
  tables: ArtifactMarkdownTable[]
) {
  if (profile === "design-spec") {
    const keySections = outlineSections.filter((section) => /布局|色彩|字体|状态|动效|交互|响应式/.test(section.title)).slice(0, 6);
    return (
      <>
        {renderSectionOutline("设计章节导航", keySections.length > 0 ? keySections : outlineSections)}
        {renderTablePreview("规范表格预览", tables)}
        {renderCodeBlockCards("样式与交互片段", codeBlocks)}
      </>
    );
  }
  if (profile === "technical-architecture") {
    const keySections = outlineSections.filter((section) => /模块|接口|数据|边界|依赖|回滚|失败|流程/.test(section.title)).slice(0, 6);
    return (
      <>
        {renderSectionOutline("架构章节导航", keySections.length > 0 ? keySections : outlineSections)}
        {renderTablePreview("接口与边界表", tables)}
        {renderCodeBlockCards("实现与伪代码片段", codeBlocks)}
      </>
    );
  }
  if (profile === "test-cases") {
    return (
      <>
        {renderTablePreview("测试用例预览", tables)}
        {renderSectionOutline("测试章节导航", outlineSections)}
        {renderCodeBlockCards("脚本与断言片段", codeBlocks)}
      </>
    );
  }
  return renderSectionOutline("文档结构", outlineSections);
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s>][\s\S]*?<\/script>/gi, "")
    .replace(/<(iframe|object|embed|form|input|textarea|button)[\s>][\s\S]*?<\/\1>/gi, "")
    .replace(/<(iframe|object|embed|form|input|textarea|button)[\s/][^>]*>/gi, "")
    .replace(/\s*on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, "")
    .replace(/href\s*=\s*["']?\s*javascript:/gi, 'href="');
}

function createMarkup(value: string) {
  const resolvedValue = extractArtifactDocumentContent(value);
  const format = detectDocumentFormat(resolvedValue);
  if (format === "html") {
    return sanitizeHtml(normalizeRichTextContent(resolvedValue));
  }
  return sanitizeHtml(markdown.render(normalizeMarkdownForPreview(resolvedValue.trim() ? resolvedValue : "*暂无内容*")));
}

export function ArtifactTextEditor({ title, value, profile = "generic", readOnly = false, showTitle = true, onChange, actions }: ArtifactTextEditorProps) {
  const resolvedValue = useMemo(() => extractArtifactDocumentContent(value), [value]);
  const documentFormat = useMemo(() => detectDocumentFormat(resolvedValue), [resolvedValue]);
  const normalizedContent = useMemo(() => normalizeRichTextContent(resolvedValue), [resolvedValue]);
  const plainText = useMemo(
    () => (documentFormat === "html" ? stripRichTextToPlainText(normalizedContent) : resolvedValue.trim()),
    [documentFormat, normalizedContent, resolvedValue]
  );
  const stats = useMemo(() => summarizeArtifactText(plainText), [plainText]);
  const structureSummary = useMemo(() => summarizeArtifactStructure(resolvedValue), [resolvedValue]);
  const outlineSections = useMemo(() => extractArtifactOutlineSections(resolvedValue), [resolvedValue]);
  const markdownCodeBlocks = useMemo(() => extractArtifactMarkdownCodeBlocks(resolvedValue), [resolvedValue]);
  const markdownTables = useMemo(() => extractArtifactMarkdownTables(resolvedValue), [resolvedValue]);
  const markdownLineNumbers = useMemo(() => buildEditorLineNumbers(resolvedValue), [resolvedValue]);
  const markdownMarkup = useMemo(() => createMarkup(resolvedValue), [resolvedValue]);
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

  const overviewConfig = useMemo(() => {
    const configMap: Record<ArtifactDocumentProfile, { title: string; stats: Array<{ label: string; value: number }> }> = {
      prd: {
        title: "需求结构",
        stats: [
          { label: "章节数", value: structureSummary.headingCount },
          { label: "表格行", value: structureSummary.tableRowCount },
          { label: "清单项", value: structureSummary.checklistCount }
        ]
      },
      "design-spec": {
        title: "设计结构",
        stats: [
          { label: "章节数", value: structureSummary.headingCount },
          { label: "代码示例", value: structureSummary.codeFenceCount },
          { label: "表格行", value: structureSummary.tableRowCount }
        ]
      },
      "technical-architecture": {
        title: "架构结构",
        stats: [
          { label: "章节数", value: structureSummary.headingCount },
          { label: "代码示例", value: structureSummary.codeFenceCount },
          { label: "表格行", value: structureSummary.tableRowCount }
        ]
      },
      "test-cases": {
        title: "测试结构",
        stats: [
          { label: "章节数", value: structureSummary.headingCount },
          { label: "表格行", value: structureSummary.tableRowCount },
          { label: "清单项", value: structureSummary.checklistCount }
        ]
      },
      "release-review": {
        title: "发布结构",
        stats: [
          { label: "章节数", value: structureSummary.headingCount },
          { label: "表格行", value: structureSummary.tableRowCount },
          { label: "清单项", value: structureSummary.checklistCount }
        ]
      },
      "delivery-package": {
        title: "归档结构",
        stats: [
          { label: "章节数", value: structureSummary.headingCount },
          { label: "表格行", value: structureSummary.tableRowCount },
          { label: "清单项", value: structureSummary.checklistCount }
        ]
      },
      generic: {
        title: "文档结构",
        stats: [{ label: "章节数", value: structureSummary.headingCount }]
      }
    };
    return configMap[profile];
  }, [profile, structureSummary.checklistCount, structureSummary.codeFenceCount, structureSummary.headingCount, structureSummary.tableRowCount]);
  const visibleOverviewStats = overviewConfig.stats.filter((item) => item.value > 0).slice(0, 4);
  const hasProfileOverview = outlineSections.length > 0 || visibleOverviewStats.length > 0 || markdownCodeBlocks.length > 0 || markdownTables.length > 0;
  const shouldShowOverview = readOnly && documentFormat === "markdown" && OVERVIEW_ENABLED_PROFILES.has(profile) && hasProfileOverview;

  return (
    <div className={`artifact-editor-shell ${readOnly ? "is-readonly" : ""}`}>
      <div className="artifact-editor-toolbar">
        {showTitle ? (
          <div className="artifact-editor-toolbar-block">
            <strong>{title}</strong>
            <span>{readOnly ? "只读交付物" : documentFormat === "html" ? "富文本编辑器" : "Markdown 编辑器"}</span>
          </div>
        ) : null}
        <div className="artifact-editor-toolbar-block is-meta">
          <span>{documentFormat === "html" ? "rich-text" : "markdown"}</span>
          <span>{stats.lines} 行</span>
          <span>{stats.chars} 字符</span>
          <span>{stats.words} 词</span>
        </div>
        {actions ? <div className="artifact-editor-toolbar-actions">{actions}</div> : null}
      </div>
      {readOnly ? (
        <>
          {shouldShowOverview ? (
            <div className="artifact-drawer-structured-content">
              {visibleOverviewStats.length > 0 ? (
                <div className="deliverable-kv-grid">
                  {visibleOverviewStats.map((item) => (
                    <div key={`${overviewConfig.title}-${item.label}`}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              ) : null}
              {outlineSections.length > 0 ? (
                renderProfileOverview(profile, outlineSections, markdownCodeBlocks, markdownTables)
              ) : null}
              {outlineSections.length === 0 ? renderProfileOverview(profile, outlineSections, markdownCodeBlocks, markdownTables) : null}
            </div>
          ) : null}
          <div className="artifact-markdown-preview" dangerouslySetInnerHTML={{ __html: markdownMarkup }} />
        </>
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
              value={resolvedValue}
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
