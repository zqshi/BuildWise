import { deleteOpsTriageTemplate, upsertOpsTriageTemplate } from "../../app/workspaceApi";
import type { OpsTriageTemplate, AttachmentAnalysisReport } from "./iterationWorkspacePanelTypes";
import { parseLines, copyText } from "./messageDisplayHelpers";

export type OpsTriageSectionProps = {
  opsTriage: AttachmentAnalysisReport["opsTriage"];
  currentIterationProjectId: number | undefined;
  opsTemplates: OpsTriageTemplate[];
  templateBusy: boolean;
  templateNotice: string;
  templateCategory: string;
  templateKeywordsText: string;
  templateCommandsText: string;
  templateNote: string;
  opsCopyNotice: string;
  setTemplateBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setTemplateNotice: React.Dispatch<React.SetStateAction<string>>;
  setTemplateCategory: React.Dispatch<React.SetStateAction<string>>;
  setTemplateKeywordsText: React.Dispatch<React.SetStateAction<string>>;
  setTemplateCommandsText: React.Dispatch<React.SetStateAction<string>>;
  setTemplateNote: React.Dispatch<React.SetStateAction<string>>;
  setOpsCopyNotice: React.Dispatch<React.SetStateAction<string>>;
  reloadOpsTemplates: () => Promise<void>;
  buildOpsCommandTemplates: (step: string, projectId: number, templates: OpsTriageTemplate[]) => string[];
};

export function OpsTriageSection({
  opsTriage,
  currentIterationProjectId,
  opsTemplates,
  templateBusy,
  templateNotice,
  templateCategory,
  templateKeywordsText,
  templateCommandsText,
  templateNote,
  opsCopyNotice,
  setTemplateBusy,
  setTemplateNotice,
  setTemplateCategory,
  setTemplateKeywordsText,
  setTemplateCommandsText,
  setTemplateNote,
  setOpsCopyNotice,
  reloadOpsTemplates,
  buildOpsCommandTemplates,
}: OpsTriageSectionProps) {
  if (!opsTriage) {
    return null;
  }

  return (
    <div className="info-box">
      <h3>运维辅助建议</h3>
      {(opsTriage.hypotheses?.length ?? 0) > 0 ? (
        <ul className="history-list">
          {opsTriage.hypotheses.slice(0, 4).map((item, index) => (
            <li key={`${item.priority}-${item.item}-${index}`} className="history-item">
              <strong>{item.priority}</strong>
              <p>{item.item}</p>
              <p className="hint">evidence：{item.evidence || "-"}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {(opsTriage.triageSteps?.length ?? 0) > 0 ? (
        <ul className="history-list">
          {opsTriage.triageSteps.slice(0, 4).map((item, index) => {
            const commands = buildOpsCommandTemplates(item.step, currentIterationProjectId ?? 1, opsTemplates);
            return (
              <li key={`${item.step}-${index}`} className="history-item">
                <strong>步骤 {index + 1}</strong>
                <p>{item.step}</p>
                <p className="hint">期望信号：{item.expectedSignal || "-"}</p>
                <p className="hint">失败回退：{item.fallback || "-"}</p>
                <p className="hint">建议命令：{commands.join("  |  ")}</p>
                <div className="chat-tools">
                  <button
                    type="button"
                    className="btn ghost mini"
                    onClick={async () => {
                      const payload = [
                        `排障步骤：${item.step}`,
                        `期望信号：${item.expectedSignal || "-"}`,
                        `失败回退：${item.fallback || "-"}`,
                        "建议命令：",
                        ...commands
                      ].join("\n");
                      await copyText(payload);
                      setOpsCopyNotice(`已复制步骤 ${index + 1} 的排障内容。`);
                    }}
                  >
                    复制该步骤
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="info-box">
        <h3>排障模板配置（项目级）</h3>
        {templateNotice ? <p className="hint">{templateNotice}</p> : null}
        <label className="hint">
          类别
          <input value={templateCategory} onChange={(event) => setTemplateCategory(event.target.value)} placeholder="如：db/network/cache" />
        </label>
        <label className="hint">
          关键词（每行一项）
          <textarea
            rows={3}
            value={templateKeywordsText}
            onChange={(event) => setTemplateKeywordsText(event.target.value)}
            placeholder={"例如：\n数据库\ndb\n连接超时"}
          />
        </label>
        <label className="hint">
          命令模板（每行一条，支持 {"{{projectId}}/{{apiBase}}/{{backendDir}}"}）
          <textarea
            rows={4}
            value={templateCommandsText}
            onChange={(event) => setTemplateCommandsText(event.target.value)}
            placeholder={"例如：\ncurl -sS {{apiBase}}/api/ops/runtime\ncd {{backendDir}} && PROJECT_ID={{projectId}} npm run ops:rollback"}
          />
        </label>
        <label className="hint">
          说明
          <input value={templateNote} onChange={(event) => setTemplateNote(event.target.value)} placeholder="模板用途说明" />
        </label>
        <div className="chat-tools">
          <button
            type="button"
            className="btn ghost mini"
            disabled={templateBusy}
            onClick={async () => {
              const keywords = parseLines(templateKeywordsText);
              const commands = parseLines(templateCommandsText);
              if (keywords.length === 0 || commands.length === 0) {
                setTemplateNotice("请至少填写 1 条关键词与 1 条命令。");
                return;
              }
              setTemplateBusy(true);
              try {
                await upsertOpsTriageTemplate({
                  projectId: currentIterationProjectId,
                  category: templateCategory.trim() || "custom",
                  keywords,
                  commands,
                  note: templateNote
                });
                await reloadOpsTemplates();
                setTemplateNotice("模板已保存。");
                setTemplateKeywordsText("");
                setTemplateCommandsText("");
                setTemplateNote("");
              } finally {
                setTemplateBusy(false);
              }
            }}
          >
            保存模板
          </button>
        </div>
        {(opsTemplates.filter((item) => item.source === "custom").length ?? 0) > 0 ? (
          <ul className="history-list">
            {opsTemplates
              .filter((item) => item.source === "custom")
              .slice(0, 8)
              .map((item) => (
                <li key={item.id} className="history-item">
                  <strong>{item.category}</strong>
                  <p className="hint">关键词：{item.keywords.join("；")}</p>
                  <p className="hint">命令：{item.commands.join("  |  ")}</p>
                  <div className="chat-tools">
                    <button
                      type="button"
                      className="btn ghost mini"
                      disabled={templateBusy}
                      onClick={async () => {
                        setTemplateBusy(true);
                        try {
                          await deleteOpsTriageTemplate(item.id);
                          await reloadOpsTemplates();
                          setTemplateNotice("模板已删除。");
                        } finally {
                          setTemplateBusy(false);
                        }
                      }}
                    >
                      删除
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        ) : (
          <p className="hint">当前项目暂无自定义排障模板。</p>
        )}
      </div>
      {opsCopyNotice ? <p className="hint">{opsCopyNotice}</p> : null}
      <p className="hint">{opsTriage.rollbackSuggestion}</p>
    </div>
  );
}
