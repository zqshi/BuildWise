import type { ProjectKnowledgeShard } from "./projectWorkspaceKnowledgeTypes";

export const VECTOR_DIMENSIONS = 128;
export const INDEX_VERSION = 1;

export type IndexedProjectKnowledgeShard = ProjectKnowledgeShard & {
  vector: number[];
};

function tokenize(text: string) {
  const normalized = text
    .toLowerCase()
    .replace(/[`*_#>[\\](){}|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) {
    return [];
  }

  const latinWords = normalized.match(/[a-z0-9_-]+/g) || [];
  const hanChars = Array.from(normalized.matchAll(/[\u4e00-\u9fff]/g)).map((match) => match[0]);
  const hanBigrams: string[] = [];
  for (let i = 0; i < hanChars.length - 1; i += 1) {
    hanBigrams.push(`${hanChars[i]}${hanChars[i + 1]}`);
  }

  return [...latinWords, ...hanChars, ...hanBigrams];
}

function hashToken(token: string) {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0;
  }
  return hash;
}

export function buildVector(text: string) {
  const tokens = tokenize(text);
  const vector = Array.from({ length: VECTOR_DIMENSIONS }, () => 0);
  for (const token of tokens) {
    const hash = hashToken(token);
    const index = Math.abs(hash) % VECTOR_DIMENSIONS;
    const sign = hash >= 0 ? 1 : -1;
    vector[index] += sign;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm > 0) {
    return vector.map((value) => Number((value / norm).toFixed(6)));
  }
  return vector;
}

export function cosineSimilarity(a: number[], b: number[]) {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    aNorm += a[i] * a[i];
    bNorm += b[i] * b[i];
  }
  if (aNorm === 0 || bNorm === 0) {
    return 0;
  }
  return dot / Math.sqrt(aNorm * bNorm);
}
