import json
import os
import re
from datetime import datetime, timezone

from .constants import ROOT
from .model import load_model, save_model
from .utils import slugify


BACKEND_TEMPLATE = """
// AUTOboot:BEGIN
import Fastify from "fastify";
import cors from "@fastify/cors";

const app = Fastify({
  logger: true
});

await app.register(cors, {
  origin: true
});

app.get("/api/status", async () => {
  return { status: "ok", service: "buildwise-v2-backend" };
});

app.get("/health", async () => {
  return { status: "healthy" };
});

const env =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ??
  {};
const PORT = Number(env.PORT || 5055);
const HOST = env.HOST || "127.0.0.1";

app.listen({ port: PORT, host: HOST }).catch((err) => {
  app.log.error(err);
  (globalThis as { process?: { exit?: (code?: number) => void } }).process?.exit?.(1);
});
// AUTOboot:END
""".strip()


BACKEND_README = """
# BuildWise v2 Backend (AutoBoot)

This backend is managed by the AutoBoot pipeline.

## Run (local)

```bash
npm install
npm run dev
```

## Endpoints
- `GET /api/status`
- `GET /health`
""".strip() + "\n"


DOC_SECTION = """
### 自举系统（自动生成）

- 该章节由 AutoBoot 流水线写入，用于验证文档可追溯更新能力。
- 自举闭环：需求 → 自动修改 → 自动验证 → 可回滚。
- 当前演示：前端提示、后端状态接口、文档同步写入。
""".strip() + "\n"


def ensure_legacy_page_list(path, pages):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    marker = "<!-- AUTOboot:PAGES -->"
    items = "\n".join([f"      <li>{p['name']}（{p['route']}）</li>" for p in pages])
    block = (
        "  <!-- AUTOboot:PAGES -->\n"
        "  <section class=\"panel\">\n"
        "    <h2>自举新增页面</h2>\n"
        "    <ul>\n"
        f"{items}\n"
        "    </ul>\n"
        "  </section>\n"
    )

    if marker in content:
        content = re.sub(r"<!-- AUTOboot:PAGES -->[\s\S]*?</section>", block.strip(), content)
    else:
        if "</body>" in content:
            content = content.replace("</body>", block + "\n</body>")
        else:
            content = content + "\n" + block

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def ensure_legacy_field_list(path, fields):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    marker = "<!-- AUTOboot:FIELDS -->"
    items = "\n".join([f"      <li>{f['entity']}.{f['name']} : {f['type']}</li>" for f in fields])
    block = (
        "  <!-- AUTOboot:FIELDS -->\n"
        "  <section class=\"panel\">\n"
        "    <h2>自举新增字段</h2>\n"
        "    <ul>\n"
        f"{items}\n"
        "    </ul>\n"
        "  </section>\n"
    )

    if marker in content:
        content = re.sub(r"<!-- AUTOboot:FIELDS -->[\s\S]*?</section>", block.strip(), content)
    else:
        if "</body>" in content:
            content = content.replace("</body>", block + "\n</body>")
        else:
            content = content + "\n" + block

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def ensure_app_page_list(app_path, pages):
    with open(app_path, "r", encoding="utf-8") as f:
        content = f.read()

    marker = "{/* AUTOboot:PAGES */}"
    items = "\n".join([f"          <li>{p['name']}（{p['route']}）</li>" for p in pages])
    block = (
        "      {/* AUTOboot:PAGES */}\n"
        "      <section className=\"panel\">\n"
        "        <h2>自举新增页面</h2>\n"
        "        <ul>\n"
        f"{items}\n"
        "        </ul>\n"
        "      </section>\n"
    )

    if marker in content:
        content = re.sub(r"\{/\* AUTOboot:PAGES \*/\}[\s\S]*?</section>", block.strip(), content)
    else:
        content = content.replace("</div>", block + "    </div>")

    with open(app_path, "w", encoding="utf-8") as f:
        f.write(content)


def ensure_app_field_list(app_path, fields):
    with open(app_path, "r", encoding="utf-8") as f:
        content = f.read()

    marker = "{/* AUTOboot:FIELDS */}"
    items = "\n".join([f"          <li>{f['entity']}.{f['name']} : {f['type']}</li>" for f in fields])
    block = (
        "      {/* AUTOboot:FIELDS */}\n"
        "      <section className=\"panel\">\n"
        "        <h2>自举新增字段</h2>\n"
        "        <ul>\n"
        f"{items}\n"
        "        </ul>\n"
        "      </section>\n"
    )

    if marker in content:
        content = re.sub(r"\{/\* AUTOboot:FIELDS \*/\}[\s\S]*?</section>", block.strip(), content)
    else:
        content = content.replace("</div>", block + "    </div>")

    with open(app_path, "w", encoding="utf-8") as f:
        f.write(content)


def ensure_backend_apis(path, apis):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    block_lines = ["// AUTOboot:APIS:BEGIN"]
    for api in apis:
        method = api["method"].lower()
        block_lines.append(f'app.{method}("{api["path"]}", async () => {{')
        block_lines.append("  return { ok: true };")
        block_lines.append("});")
        block_lines.append("")
    block_lines.append("// AUTOboot:APIS:END")
    block = "\n".join(block_lines)

    if "// AUTOboot:APIS:BEGIN" in content:
        content = re.sub(r"// AUTOboot:APIS:BEGIN[\s\S]*// AUTOboot:APIS:END", block, content)
    else:
        content = content.replace("const PORT", block + "\n\nconst PORT")

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def write_plan(plan_path, req, actions, context_bundle=None):
    data = {
        "title": req["title"],
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "actions": actions,
        "context": {
            "context_id": context_bundle["context_id"] if context_bundle else None,
            "files": context_bundle["files"] if context_bundle else [],
            "merged_text": context_bundle["merged_text"] if context_bundle else "",
        },
    }
    with open(plan_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return data


def insert_frontend_notice(path):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    # Keep frontend shell clean: remove any legacy AUTOboot UI fragments from index.html.
    content = re.sub(r"\s*<!-- AUTOboot:BEGIN -->[\s\S]*?<!-- AUTOboot:END -->\s*", "\n", content)
    content = re.sub(r"\s*<!-- AUTOboot:FIELDS -->[\s\S]*?</section>\s*", "\n", content)
    content = re.sub(r"\s*<!-- AUTOboot:PAGES -->[\s\S]*?</section>\s*", "\n", content)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return True


def update_backend(path):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
    else:
        content = (
            'import type { FastifyInstance } from "fastify";\n\n'
            "export async function registerSystemRoutes(app: FastifyInstance) {\n}\n"
        )

    if "/api/status" not in content:
        content = content.replace(
            "export async function registerSystemRoutes(app: FastifyInstance) {\n",
            (
                "export async function registerSystemRoutes(app: FastifyInstance) {\n"
                '  app.get("/api/status", async () => {\n'
                '    return { status: "ok", service: "buildwise-v2-backend" };\n'
                "  });\n\n"
            ),
        )
    if "/health" not in content:
        content = content.replace(
            "export async function registerSystemRoutes(app: FastifyInstance) {\n",
            (
                "export async function registerSystemRoutes(app: FastifyInstance) {\n"
                '  app.get("/health", async () => {\n'
                '    return { status: "healthy" };\n'
                "  });\n\n"
            ),
        )

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)


def ensure_backend_readme(path):
    if os.path.exists(path):
        return False
    with open(path, "w", encoding="utf-8") as f:
        f.write(BACKEND_README)
    return True


def append_doc_section(path):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    if "自举系统（自动生成）" in content:
        return False
    content = content.rstrip() + "\n\n" + DOC_SECTION
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return True
