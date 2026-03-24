import test from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import cors from "@fastify/cors";

const { resolveCorsOriginOption } = await import("../dist/infrastructure/runtime/runtimeCors.js");
const { applyCorsResponseHeaders } = await import("../dist/infrastructure/runtime/runtimeCors.js");

test("development cors reflection echoes request origin when credentials are enabled", async () => {
  const app = Fastify();
  await app.register(cors, {
    origin: resolveCorsOriginOption(true),
    credentials: true
  });
  app.get("/status", async () => ({ ok: true }));

  const response = await app.inject({
    method: "GET",
    url: "/status",
    headers: {
      origin: "http://127.0.0.1:4173"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["access-control-allow-origin"], "http://127.0.0.1:4173");
  assert.equal(response.headers["access-control-allow-credentials"], "true");

  await app.close();
});

test("runtime hook mirrors allowed dev origin onto response headers", async () => {
  const headers = new Map();
  const reply = {
    header(name, value) {
      headers.set(String(name).toLowerCase(), value);
      return this;
    }
  };

  applyCorsResponseHeaders(reply, "http://127.0.0.1:4173", true);

  assert.equal(headers.get("access-control-allow-origin"), "http://127.0.0.1:4173");
  assert.equal(headers.get("access-control-allow-credentials"), "true");
  assert.equal(headers.get("vary"), "Origin");
});
