export type AnalysisArtifactSection = {
  title: string;
  content: string;
  bullets: string[];
};

export type AnalysisArtifactPreview = {
  summary: string;
  evidence: string[];
};

function normalizeLine(line: string) {
  return line.replace(/^[\s\u3000]+|[\s\u3000]+$/g, "");
}

export function parseAnalysisArtifactSections(content: string) {
  const lines = content
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean);

  const sections: AnalysisArtifactSection[] = [];
  let current: AnalysisArtifactSection | null = null;

  const pushCurrent = () => {
    if (!current) return;
    if (current.content || current.bullets.length > 0) {
      sections.push(current);
    }
    current = null;
  };

  for (const line of lines) {
    if (/^[-*•]\s*/.test(line)) {
      if (!current) {
        current = { title: "补充信息", content: "", bullets: [] };
      }
      current.bullets.push(line.replace(/^[-*•]\s*/, "").trim());
      continue;
    }

    const matched = line.match(/^([^:：]{1,18})[:：]\s*(.*)$/);
    if (matched) {
      pushCurrent();
      current = {
        title: matched[1].trim(),
        content: matched[2].trim(),
        bullets: []
      };
      continue;
    }

    if (!current) {
      current = { title: "分析内容", content: line, bullets: [] };
      continue;
    }
    current.content = current.content ? `${current.content}\n${line}` : line;
  }

  pushCurrent();
  return sections;
}

export function buildAnalysisArtifactPreview(content: string): AnalysisArtifactPreview {
  const sections = parseAnalysisArtifactSections(content);
  if (sections.length === 0) {
    return { summary: "", evidence: [] };
  }
  const summary = sections
    .slice(0, 2)
    .map((section) => `${section.title}：${section.content || section.bullets[0] || "-"}`)
    .join("；");
  const evidence = sections
    .flatMap((section) =>
      section.bullets.length > 0
        ? section.bullets
        : section.content
          ? [`${section.title}：${section.content}`]
          : []
    )
    .slice(0, 4);
  return {
    summary,
    evidence
  };
}
