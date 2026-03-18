import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    authRole?: string;
    authSub?: string;
  }
}

