import { useState } from "react";

export function useOpsTemplateForm() {
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateNotice, setTemplateNotice] = useState("");
  const [templateCategory, setTemplateCategory] = useState("custom");
  const [templateKeywordsText, setTemplateKeywordsText] = useState("");
  const [templateCommandsText, setTemplateCommandsText] = useState("");
  const [templateNote, setTemplateNote] = useState("");
  const [opsCopyNotice, setOpsCopyNotice] = useState("");

  return {
    templateBusy, setTemplateBusy,
    templateNotice, setTemplateNotice,
    templateCategory, setTemplateCategory,
    templateKeywordsText, setTemplateKeywordsText,
    templateCommandsText, setTemplateCommandsText,
    templateNote, setTemplateNote,
    opsCopyNotice, setOpsCopyNotice,
  };
}
