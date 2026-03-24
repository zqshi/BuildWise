import { extractArtifactDisplayContent } from "../../app/artifactContentPresentation.ts";
import { detectCodeLanguage } from "./artifactEditorModel.ts";

export type ArtifactCodeFile = {
  path: string;
  language: string;
  code: string;
  summary: string;
};

export type ArtifactCodeStructure = {
  overview: string[];
  files: ArtifactCodeFile[];
};

function normalizeLines(value: string) {
  return extractArtifactDisplayContent(value).replace(/\r\n/g, "\n").split("\n");
}

function stripMarkdownDecoration(value: string) {
  return value
    .replace(/^#{1,6}\s+/, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function normalizePathCandidate(value: string) {
  return value
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .replace(/^#{1,6}\s+/, "")
    .replace(/^文件[:：]\s*/i, "")
    .replace(/^路径[:：]\s*/i, "")
    .replace(/^`([^`]+)`$/, "$1")
    .trim();
}

function looksLikeFilePath(value: string) {
  const candidate = normalizePathCandidate(value);
  if (!candidate || candidate.length > 160 || /\s{2,}/.test(candidate)) {
    return false;
  }
  if (/[<>]/.test(candidate)) {
    return false;
  }
  if (/^(src|app|pages|components|hooks|services|lib|api|backend|frontend|server|client|routes|db|scripts|tests?)\//.test(candidate)) {
    return true;
  }
  return /(?:^|\/)(?:[A-Za-z0-9_.-]+)\.(?:tsx?|jsx?|mjs|cjs|json|css|scss|sql|md|yml|yaml|sh|py|java|go|rs)$/.test(candidate);
}

function extractPathCandidate(line: string) {
  const normalized = normalizePathCandidate(line);
  if (looksLikeFilePath(normalized)) {
    return normalized;
  }
  const inlineMatch = line.match(/`([^`]+)`/);
  if (inlineMatch && looksLikeFilePath(inlineMatch[1])) {
    return normalizePathCandidate(inlineMatch[1]);
  }
  return "";
}

function buildFallbackPath(title: string, language: string, index: number) {
  const loweredTitle = title.toLowerCase();
  if (loweredTitle.includes("frontend") || /前端/.test(title)) {
    return index === 0 ? "src/pages/CreativeGeneratorPage.tsx" : `src/generated/file-${index + 1}.${language === "tsx" ? "tsx" : "ts"}`;
  }
  if (loweredTitle.includes("backend") || /后端/.test(title)) {
    return index === 0 ? "backend/src/routes/creativeGenerator.ts" : `backend/src/generated/file-${index + 1}.${language || "ts"}`;
  }
  const extension = language === "tsx" || language === "jsx" ? language : language || "txt";
  return `generated/file-${index + 1}.${extension}`;
}

function deriveSummary(lines: string[]) {
  return lines
    .map((line) => stripMarkdownDecoration(line))
    .find((line) => line && !looksLikeFilePath(line) && !/^```/.test(line)) || "";
}

export function extractArtifactCodeStructure(title: string, value: string): ArtifactCodeStructure {
  const lines = normalizeLines(value);
  const overview: string[] = [];
  const files: ArtifactCodeFile[] = [];
  let pendingPath = "";
  let pendingSummaryLines: string[] = [];
  let inFence = false;
  let fenceLanguage = "";
  let codeBuffer: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const fenceMatch = line.match(/^```([\w-]*)\s*$/);
    if (fenceMatch) {
      if (inFence) {
        const code = codeBuffer.join("\n").trimEnd();
        if (code) {
          const language = fenceLanguage || detectCodeLanguage(pendingPath || title, code);
          files.push({
            path: pendingPath || buildFallbackPath(title, language, files.length),
            language,
            code,
            summary: deriveSummary(pendingSummaryLines)
          });
        }
        inFence = false;
        fenceLanguage = "";
        codeBuffer = [];
        pendingPath = "";
        pendingSummaryLines = [];
      } else {
        inFence = true;
        fenceLanguage = fenceMatch[1]?.trim().toLowerCase() || "";
      }
      continue;
    }

    if (inFence) {
      codeBuffer.push(rawLine);
      continue;
    }

    const pathCandidate = extractPathCandidate(line);
    if (pathCandidate) {
      pendingPath = pathCandidate;
      continue;
    }

    const stripped = stripMarkdownDecoration(line);
    if (!stripped) {
      continue;
    }
    if (pendingPath) {
      pendingSummaryLines.push(stripped);
    } else if (files.length === 0 && overview.length < 5) {
      overview.push(stripped);
    } else {
      pendingSummaryLines.push(stripped);
    }
  }

  if (files.length === 0) {
    const raw = extractArtifactDisplayContent(value).trim();
    if (raw) {
      const language = detectCodeLanguage(title, raw);
      files.push({
        path: buildFallbackPath(title, language, 0),
        language,
        code: raw,
        summary: ""
      });
    }
  }

  return {
    overview: overview.filter((line, index, collection) => collection.indexOf(line) === index),
    files
  };
}
