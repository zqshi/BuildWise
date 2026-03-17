export type AnalysisArtifactSection = {
  title: string;
  content: string;
  bullets: string[];
};

export type AnalysisArtifactPreview = {
  summary: string;
  evidence: string[];
};

const INTERNAL_NOISE_LINE = /^\[(skills|skill)\]/i;
const PRIORITY_SECTION_TITLES = [
  "问题定义",
  "目标",
  "用户场景",
  "纳入范围",
  "排除项",
  "关键约束",
  "风险",
  "待确认",
  "待处理点",
  "边界",
  "验收标准"
];

function normalizeLine(line: string) {
  return line.replace(/^[\s\u3000]+|[\s\u3000]+$/g, "");
}

export function parseAnalysisArtifactSections(content: string) {
  const lines = content
    .split("\n")
    .map(normalizeLine)
    .filter(Boolean)
    .filter((line) => !INTERNAL_NOISE_LINE.test(line));

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
  const ranked = [...sections].sort((left, right) => {
    const leftIndex = PRIORITY_SECTION_TITLES.findIndex((title) => left.title.includes(title));
    const rightIndex = PRIORITY_SECTION_TITLES.findIndex((title) => right.title.includes(title));
    const leftRank = leftIndex === -1 ? PRIORITY_SECTION_TITLES.length : leftIndex;
    const rightRank = rightIndex === -1 ? PRIORITY_SECTION_TITLES.length : rightIndex;
    return leftRank - rightRank;
  });
  const summary = ranked
    .filter((section) => section.content || section.bullets[0])
    .slice(0, 2)
    .map((section) => `${section.title}：${section.content || section.bullets[0] || "-"}`)
    .join("；");
  const evidence = ranked
    .flatMap((section) => {
      if (section.bullets.length > 0) {
        return section.bullets.map((item) => (/^[^:：]{1,18}[:：]/.test(item) ? item : `${section.title}：${item}`));
      }
      if (section.content) {
        return [`${section.title}：${section.content}`];
      }
      return [];
    })
    .slice(0, 4);
  return {
    summary,
    evidence
  };
}
