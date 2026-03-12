import type { FastifyReply } from "fastify";
import { parsePositiveInt } from "./workspaceRouteUtils";

export function resolveIterationId(reply: FastifyReply, rawId: string): number | null {
  const iterationId = parsePositiveInt(rawId);
  if (iterationId === null) {
    reply.code(400);
    return null;
  }
  return iterationId;
}

export function resolveArtifactId(reply: FastifyReply, rawArtifactId: string): string | null {
  const artifactId = rawArtifactId.trim();
  if (!artifactId) {
    reply.code(400);
    return null;
  }
  return artifactId;
}
