#!/usr/bin/env python3

import argparse
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DOCS_DIR = os.path.join(ROOT, "docs")
STATE_FILE = os.path.join(ROOT, "autoboot", "state.json")
PLANS_DIR = os.path.join(ROOT, "autoboot", "plans")
RUNS_DIR = os.path.join(ROOT, "autoboot", "runs")
REPORTS_DIR = os.path.join(ROOT, "autoboot", "reports")
CONTEXT_DIR = os.path.join(ROOT, "autoboot", "context")
CONTEXT_MANIFEST_FILE = os.path.join(CONTEXT_DIR, "context_manifest.json")
MODEL_FILE = os.path.join(ROOT, "v2", "model.json")
LAYOUT_GATE_FILE = os.path.join(ROOT, "autoboot", "gates", "layout_gate.v1.json")


def new_id(prefix, directory=None, extension=""):
    base = datetime.now(timezone.utc).strftime(f"{prefix}-%Y%m%d-%H%M%S-%f")
    if directory is None:
        return base
    candidate = base + extension
    if not os.path.exists(os.path.join(directory, candidate)):
        return base
    i = 1
    while True:
        alt = f"{base}-{i}"
        candidate = alt + extension
        if not os.path.exists(os.path.join(directory, candidate)):
            return alt
        i += 1


def _shorten(text, max_chars):
    if max_chars <= 0 or len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "\n...[truncated]"


def load_context_manifest():
    if not os.path.exists(CONTEXT_MANIFEST_FILE):
        return {"sources": []}
    with open(CONTEXT_MANIFEST_FILE, "r", encoding="utf-8") as f:
        parsed = json.load(f)
    sources = parsed.get("sources", [])
    if not isinstance(sources, list):
        return {"sources": []}
    return {"sources": sources}


def build_context_bundle():
    manifest = load_context_manifest()
    loaded = []
    merged_parts = []
    for item in manifest["sources"]:
        rel_path = item.get("path", "")
        if not rel_path:
            continue
        abs_path = os.path.join(ROOT, rel_path)
        if not os.path.exists(abs_path):
            loaded.append(
                {
                    "path": rel_path,
                    "exists": False,
                    "required": bool(item.get("required", False)),
                    "summary": item.get("summary", ""),
                }
            )
            continue
        max_chars = int(item.get("max_chars", 1200))
        with open(abs_path, "r", encoding="utf-8") as f:
            raw = f.read()
        excerpt = _shorten(raw, max_chars)
        loaded.append(
            {
                "path": rel_path,
                "exists": True,
                "required": bool(item.get("required", False)),
                "summary": item.get("summary", ""),
                "chars": len(excerpt),
            }
        )
        merged_parts.append(f"## {rel_path}\n\n{excerpt}")

    merged = "\n\n".join(merged_parts).strip()
    context_id = new_id("context")
    missing_required = [item["path"] for item in loaded if not item.get("exists") and item.get("required")]
    return {
        "context_id": context_id,
        "manifest": manifest,
        "files": loaded,
        "merged_text": merged,
        "missing_required": missing_required,
    }


def validate_context_bundle(context_bundle):
    missing = context_bundle.get("missing_required", [])
    if missing:
        return False, missing
    return True, []

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


def load_request(path):
    with open(path, "r", encoding="utf-8") as f:
        raw = f.read()
    title = None
    for line in raw.splitlines():
        if line.strip().startswith("#"):
            title = line.strip("# ")
            break
    if not title:
        title = os.path.basename(path)

    tags = {
        "frontend": bool(re.search(r"\bfrontend\b|前端", raw, re.I)),
        "backend": bool(re.search(r"\bbackend\b|后端", raw, re.I)),
        "docs": bool(re.search(r"\bdocs\b|文档", raw, re.I)),
    }

    doc_file = None
    m = re.search(r"DOC_FILE:\s*(.+)", raw)
    if m:
        doc_file = m.group(1).strip()

    pages = []
    apis = []
    fields = []

    for line in raw.splitlines():
        line = line.strip()
        if line.startswith("PAGE:"):
            payload = line.replace("PAGE:", "", 1).strip()
            parts = [p.strip() for p in payload.split("|") if p.strip()]
            if len(parts) == 2:
                pages.append({"name": parts[0], "route": parts[1]})
        if line.startswith("API:"):
            payload = line.replace("API:", "", 1).strip()
            parts = payload.split()
            if len(parts) >= 2:
                apis.append({"method": parts[0].upper(), "path": parts[1]})
        if line.startswith("FIELD:"):
            payload = line.replace("FIELD:", "", 1).strip()
            parts = payload.split()
            if parts:
                name_part = parts[0]
                ftype = parts[1] if len(parts) > 1 else "string"
                required = "required" in [p.lower() for p in parts[2:]]
                if "." in name_part:
                    entity, field = name_part.split(".", 1)
                    fields.append({"entity": entity, "name": field, "type": ftype, "required": required})

    return {
        "title": title,
        "raw": raw,
        "tags": tags,
        "doc_file": doc_file,
        "pages": pages,
        "apis": apis,
        "fields": fields,
    }


def plan_actions(req):
    actions = []
    if req["tags"]["frontend"]:
        actions.append({
            "type": "frontend_add_notice",
            "files": [
                os.path.join(ROOT, "v2", "index.html"),
            ],
        })
    if req["tags"]["backend"]:
        actions.append({
            "type": "backend_add_status_endpoint",
            "file": os.path.join(ROOT, "v2", "backend", "src", "interfaces", "http", "routes", "systemRoutes.ts"),
            "readme": os.path.join(ROOT, "v2", "backend", "README.md"),
        })
    if req["tags"]["docs"]:
        doc_file = req["doc_file"] or os.path.join(ROOT, "docs", "【1】「构想即应用」AI原生软件构建平台商机计划书.md")
        actions.append({
            "type": "docs_append_section",
            "file": doc_file,
        })

    if req["pages"]:
        actions.append({
            "type": "add_pages",
            "pages": req["pages"],
        })
    if req["apis"]:
        actions.append({
            "type": "add_apis",
            "apis": req["apis"],
        })
    if req["fields"]:
        actions.append({
            "type": "add_fields",
            "fields": req["fields"],
        })

    return actions


def load_model():
    if not os.path.exists(MODEL_FILE):
        return {"entities": [], "rules": [], "pages": []}
    with open(MODEL_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_model(model):
    with open(MODEL_FILE, "w", encoding="utf-8") as f:
        json.dump(model, f, ensure_ascii=False, indent=2)


def slugify(text):
    value = re.sub(r"[^a-zA-Z0-9\-]+", "-", text.strip().lower())
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "page"


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


def ensure_backend_readme(path):
    if os.path.exists(path):
        return False
    with open(path, "w", encoding="utf-8") as f:
        f.write(BACKEND_README)
    return True


DOC_SECTION = """
### 自举系统（自动生成）

- 该章节由 AutoBoot 流水线写入，用于验证文档可追溯更新能力。
- 自举闭环：需求 → 自动修改 → 自动验证 → 可回滚。
- 当前演示：前端提示、后端状态接口、文档同步写入。
""".strip() + "\n"


def append_doc_section(path):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    if "自举系统（自动生成）" in content:
        return False
    content = content.rstrip() + "\n\n" + DOC_SECTION
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return True


def backup_files(run_dir, files):
    backup_dir = os.path.join(run_dir, "backup")
    os.makedirs(backup_dir, exist_ok=True)
    manifest = []

    for fpath in files:
        rel = os.path.relpath(fpath, ROOT)
        dest = os.path.join(backup_dir, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        existed = os.path.exists(fpath)
        if existed:
            shutil.copy2(fpath, dest)
        manifest.append({"path": fpath, "existed": existed})

    return manifest


def rollback(run_id):
    run_dir = os.path.join(RUNS_DIR, run_id)
    run_file = os.path.join(run_dir, "run.json")
    if not os.path.exists(run_file):
        raise RuntimeError(f"run not found: {run_id}")

    with open(run_file, "r", encoding="utf-8") as f:
        run = json.load(f)

    for item in run.get("files", []):
        path = item["path"]
        existed = item["existed"]
        rel = os.path.relpath(path, ROOT)
        backup_path = os.path.join(run_dir, "backup", rel)

        if existed and os.path.exists(backup_path):
            os.makedirs(os.path.dirname(path), exist_ok=True)
            shutil.copy2(backup_path, path)
        elif not existed and os.path.exists(path):
            os.remove(path)

    return run


def verify(actions):
    checks = []
    ok = True

    for action in actions:
        if action["type"] == "frontend_add_notice":
            for fpath in action["files"]:
                with open(fpath, "r", encoding="utf-8") as f:
                    content = f.read()
                shell_clean = (
                    "AUTOboot:BEGIN" not in content
                    and "AUTOboot:FIELDS" not in content
                    and "AUTOboot:PAGES" not in content
                )
                checks.append({"file": fpath, "check": "frontend shell clean", "ok": shell_clean})
                ok = ok and shell_clean
        elif action["type"] == "backend_add_status_endpoint":
            fpath = action["file"]
            fallback = os.path.join(
                ROOT, "v2", "backend", "src", "interfaces", "http", "routes", "systemRoutes.ts"
            )
            candidates = [p for p in [fpath, fallback] if os.path.exists(p)]
            target = candidates[0] if candidates else fallback
            if not candidates:
                checks.append({"file": fallback, "check": "status route file exists", "ok": False})
                ok = False
            else:
                present = False
                for candidate in candidates:
                    with open(candidate, "r", encoding="utf-8") as f:
                        content = f.read()
                    if "/api/status" in content and "/health" in content:
                        target = candidate
                        present = True
                        break
                checks.append({"file": target, "check": "status+health routes", "ok": present})
                ok = ok and present
        elif action["type"] == "docs_append_section":
            fpath = action["file"]
            with open(fpath, "r", encoding="utf-8") as f:
                content = f.read()
            present = "自举系统（自动生成）" in content
            checks.append({"file": fpath, "check": "doc section", "ok": present})
            ok = ok and present
        elif action["type"] == "add_pages":
            model_file = MODEL_FILE
            with open(model_file, "r", encoding="utf-8") as f:
                model = json.load(f)
            pages = model.get("pages", []) if isinstance(model, dict) else []
            expected_ids = [f"page_{slugify(item['name'])}" for item in action.get("pages", [])]
            present = all(any(p.get("id") == page_id for p in pages) for page_id in expected_ids)
            checks.append({"file": model_file, "check": "model pages", "ok": present})
            ok = ok and present
        elif action["type"] == "add_apis":
            model_file = MODEL_FILE
            with open(model_file, "r", encoding="utf-8") as f:
                model = json.load(f)
            apis = model.get("apis", []) if isinstance(model, dict) else []
            present = len(apis) > 0
            checks.append({"file": model_file, "check": "model apis", "ok": present})
            ok = ok and present
        elif action["type"] == "add_fields":
            model_file = MODEL_FILE
            with open(model_file, "r", encoding="utf-8") as f:
                model = json.load(f)
            entities = model.get("entities", []) if isinstance(model, dict) else []
            present = True
            for item in action.get("fields", []):
                entity_id = f"entity_{slugify(item['entity'])}"
                field_id = f"field_{slugify(item['name'])}"
                entity = next((e for e in entities if e.get("id") == entity_id), None)
                if not entity or not any(field.get("id") == field_id for field in entity.get("fields", [])):
                    present = False
                    break
            checks.append({"file": model_file, "check": "model fields", "ok": present})
            ok = ok and present

    return ok, checks


def run_layout_gate():
    default = {"enabled": False, "passed": True, "score": 1.0, "threshold": 0.0, "rules": []}
    if not os.path.exists(LAYOUT_GATE_FILE):
        return default

    with open(LAYOUT_GATE_FILE, "r", encoding="utf-8") as f:
        gate = json.load(f)

    if not gate.get("enabled", False):
        return default

    contract_rel = gate.get("contract_file", "autoboot/contracts/layout_contract.v1.json")
    contract_file = os.path.join(ROOT, contract_rel)
    if not os.path.exists(contract_file):
        return {
            "enabled": True,
            "passed": False,
            "score": 0.0,
            "threshold": gate.get("threshold", 0.82),
            "error": f"contract not found: {contract_rel}",
            "rules": [],
        }

    with open(contract_file, "r", encoding="utf-8") as f:
        contract = json.load(f)

    baseline_file = os.path.join(ROOT, contract["baseline_file"])
    target_file = os.path.join(ROOT, contract["target_file"])
    with open(baseline_file, "r", encoding="utf-8") as f:
        baseline_text = f.read()
    with open(target_file, "r", encoding="utf-8") as f:
        target_text = f.read()

    total_weight = 0.0
    total_score = 0.0
    rules = []
    critical_failures = []
    for rule in contract.get("rules", []):
        baseline_patterns = rule.get("baseline_patterns", [])
        target_patterns = rule.get("target_patterns", [])
        baseline_hits = [p for p in baseline_patterns if p in baseline_text]
        target_hits = [p for p in target_patterns if p in target_text]
        weight = float(rule.get("weight", 1))
        ratio = 0.0 if len(target_patterns) == 0 else len(target_hits) / len(target_patterns)
        target_ok = len(target_hits) == len(target_patterns)
        rep = {
            "id": rule.get("id", "unknown"),
            "title": rule.get("title", ""),
            "critical": bool(rule.get("critical", False)),
            "weight": weight,
            "baseline_ok": len(baseline_hits) == len(baseline_patterns),
            "baseline_missing": [p for p in baseline_patterns if p not in baseline_hits],
            "target_ok": target_ok,
            "target_missing": [p for p in target_patterns if p not in target_hits],
            "target_ratio": round(ratio, 4),
            "score": round(weight * ratio, 4),
        }
        rules.append(rep)
        total_weight += weight
        total_score += weight * ratio
        if rep["critical"] and not target_ok:
            critical_failures.append(rep["id"])

    threshold = float(gate.get("threshold", 0.82))
    score = 0.0 if total_weight == 0 else total_score / total_weight
    passed = score >= threshold and not critical_failures

    report = {
        "enabled": True,
        "gate": gate.get("name", "layout-gate"),
        "threshold": threshold,
        "score": round(score, 4),
        "passed": passed,
        "critical_failures": critical_failures,
        "rules": rules,
        "evaluated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }

    report_file_rel = gate.get("report_file")
    if report_file_rel:
        report_file = os.path.join(ROOT, report_file_rel)
        os.makedirs(os.path.dirname(report_file), exist_ok=True)
        with open(report_file, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

    return report


def apply_actions(actions, run_id, context_bundle=None):
    run_dir = os.path.join(RUNS_DIR, run_id)
    os.makedirs(run_dir, exist_ok=True)

    files_to_backup = []
    for action in actions:
        if action["type"] == "frontend_add_notice":
            files_to_backup.extend(action["files"])
        elif action["type"] == "backend_add_status_endpoint":
            files_to_backup.append(action["file"])
            files_to_backup.append(action["readme"])
        elif action["type"] == "docs_append_section":
            files_to_backup.append(action["file"])
        elif action["type"] == "add_pages":
            files_to_backup.append(MODEL_FILE)
        elif action["type"] == "add_apis":
            files_to_backup.append(MODEL_FILE)
        elif action["type"] == "add_fields":
            files_to_backup.append(MODEL_FILE)

    manifest = backup_files(run_dir, files_to_backup)

    changed = []
    for action in actions:
        if action["type"] == "frontend_add_notice":
            for fpath in action["files"]:
                if insert_frontend_notice(fpath):
                    changed.append(fpath)
        elif action["type"] == "backend_add_status_endpoint":
            update_backend(action["file"])
            changed.append(action["file"])
            if ensure_backend_readme(action["readme"]):
                changed.append(action["readme"])
        elif action["type"] == "docs_append_section":
            if append_doc_section(action["file"]):
                changed.append(action["file"])
        elif action["type"] == "add_pages":
            model = load_model()
            for page in action["pages"]:
                page_id = f"page_{slugify(page['name'])}"
                if not any(p["id"] == page_id for p in model["pages"]):
                    model["pages"].append({
                        "id": page_id,
                        "name": page["name"],
                        "route": page["route"],
                        "layout": "standard",
                        "components": []
                    })
            save_model(model)
            changed.append(MODEL_FILE)
        elif action["type"] == "add_apis":
            model = load_model()
            for api in action["apis"]:
                api_id = f"api_{slugify(api['method'] + '-' + api['path'])}"
                if "apis" not in model:
                    model["apis"] = []
                if not any(a["id"] == api_id for a in model["apis"]):
                    model["apis"].append({
                        "id": api_id,
                        "method": api["method"],
                        "path": api["path"]
                    })
            save_model(model)
            changed.append(MODEL_FILE)
        elif action["type"] == "add_fields":
            model = load_model()
            for field in action["fields"]:
                entity_id = f"entity_{slugify(field['entity'])}"
                entity = next((e for e in model["entities"] if e["id"] == entity_id), None)
                if not entity:
                    entity = {"id": entity_id, "name": field["entity"], "fields": []}
                    model["entities"].append(entity)
                field_id = f"field_{slugify(field['name'])}"
                if not any(f["id"] == field_id for f in entity["fields"]):
                    entity["fields"].append({
                        "id": field_id,
                        "name": field["name"],
                        "type": field["type"],
                        "required": field["required"]
                    })
            save_model(model)
            changed.append(MODEL_FILE)

    run_data = {
        "run_id": run_id,
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "actions": actions,
        "files": manifest,
        "changed": changed,
        "context": {
            "context_id": context_bundle["context_id"] if context_bundle else None,
            "files": context_bundle["files"] if context_bundle else [],
        },
    }
    with open(os.path.join(run_dir, "run.json"), "w", encoding="utf-8") as f:
        json.dump(run_data, f, ensure_ascii=False, indent=2)

    return run_data


def save_state(data):
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_state():
    if not os.path.exists(STATE_FILE):
        return None
    with open(STATE_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def cmd_plan(args):
    req = load_request(args.request)
    actions = plan_actions(req)
    if not actions:
        print("No actions planned. Add keywords frontend/backend/docs in the request.")
        return 2

    context_bundle = build_context_bundle()
    ok_ctx, missing_required = validate_context_bundle(context_bundle)
    if not ok_ctx:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "required context docs missing",
                    "missing_required": missing_required,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 2
    plan_id = new_id("plan", PLANS_DIR, ".json")
    plan_path = os.path.join(PLANS_DIR, plan_id + ".json")
    write_plan(plan_path, req, actions, context_bundle)
    print(plan_path)
    return 0


def cmd_apply(args):
    with open(args.plan, "r", encoding="utf-8") as f:
        plan = json.load(f)
    run_id = new_id("run", RUNS_DIR)
    context = plan.get("context", {})
    context_bundle = {
        "context_id": context.get("context_id"),
        "files": context.get("files", []),
        "merged_text": context.get("merged_text", ""),
    }
    run_data = apply_actions(plan["actions"], run_id, context_bundle)
    save_state({"last_run": run_id, "plan": args.plan})
    print(run_id)
    return 0


def cmd_verify(args):
    plan = None
    if args.plan:
        with open(args.plan, "r", encoding="utf-8") as f:
            plan = json.load(f)
    else:
        state = load_state()
        if not state:
            print("No state available. Provide --plan or run apply first.")
            return 2
        with open(state["plan"], "r", encoding="utf-8") as f:
            plan = json.load(f)

    ok, checks = verify(plan["actions"])
    gate = run_layout_gate()
    final_ok = ok and gate.get("passed", True)
    print(json.dumps({"ok": final_ok, "checks": checks, "layout_gate": gate}, ensure_ascii=False, indent=2))
    return 0 if final_ok else 1


def cmd_rollback(args):
    run_id = args.run
    if not run_id:
        state = load_state()
        if not state:
            print("No state available. Provide --run or run apply first.")
            return 2
        run_id = state["last_run"]
    rollback(run_id)
    print(run_id)
    return 0


def cmd_run(args):
    req = load_request(args.request)
    actions = plan_actions(req)
    if not actions:
        print("No actions planned. Add keywords frontend/backend/docs in the request.")
        return 2

    context_bundle = build_context_bundle()
    ok_ctx, missing_required = validate_context_bundle(context_bundle)
    if not ok_ctx:
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": "required context docs missing",
                    "missing_required": missing_required,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 2
    plan_id = new_id("plan", PLANS_DIR, ".json")
    plan_path = os.path.join(PLANS_DIR, plan_id + ".json")
    write_plan(plan_path, req, actions, context_bundle)

    run_id = new_id("run", RUNS_DIR)
    apply_actions(actions, run_id, context_bundle)

    ok, checks = verify(actions)
    gate = run_layout_gate()
    final_ok = ok and gate.get("passed", True)
    if not final_ok:
        rollback(run_id)

    save_state(
        {
            "last_run": run_id,
            "plan": plan_path,
            "ok": final_ok,
            "context_id": context_bundle.get("context_id"),
        }
    )

    print(json.dumps({"run_id": run_id, "ok": final_ok, "checks": checks, "layout_gate": gate}, ensure_ascii=False, indent=2))
    return 0 if final_ok else 1


def extract_request_number(path):
    name = os.path.basename(path)
    m = re.match(r"REQ-(\d+)-", name, re.IGNORECASE)
    if not m:
        return 10**9
    return int(m.group(1))


def next_request_number(requests_dir):
    req_files = list_request_files(requests_dir)
    if not req_files:
        return 1
    return max(extract_request_number(path) for path in req_files) + 1


def parse_roadmap_versions(roadmap_file):
    with open(roadmap_file, "r", encoding="utf-8") as f:
        lines = f.read().splitlines()

    versions = []
    current = None
    for raw_line in lines:
        line = raw_line.strip()
        m = re.match(r"^(\d+)\.\s*版本\s+(V[\d.]+)\s+(.+)$", line)
        if m:
            if current:
                versions.append(current)
            current = {
                "index": int(m.group(1)),
                "version": m.group(2),
                "title": m.group(3).strip(),
                "goal": "",
                "frontend": "",
                "backend": "",
                "acceptance": "",
            }
            continue
        if not current:
            continue
        if line.startswith("- 目标："):
            current["goal"] = line.replace("- 目标：", "", 1).strip()
        elif line.startswith("- 前端："):
            current["frontend"] = line.replace("- 前端：", "", 1).strip()
        elif line.startswith("- 后端："):
            current["backend"] = line.replace("- 后端：", "", 1).strip()
        elif line.startswith("- 验收："):
            current["acceptance"] = line.replace("- 验收：", "", 1).strip()
    if current:
        versions.append(current)
    return versions


def build_route_from_version(version):
    return "/roadmap-" + version.lower().replace(".", "-")


def build_entity_from_version(version):
    return "Iteration" + re.sub(r"[^0-9]", "", version)


def render_request_from_version(item, roadmap_file):
    route = build_route_from_version(item["version"])
    entity = build_entity_from_version(item["version"])
    title = f"{item['version']} {item['title']}"
    return (
        f"# 迭代候选：{title}\n\n"
        f"目标：{item['goal'] or '待补充'}\n\n"
        "frontend\n"
        "backend\n"
        "docs\n\n"
        f"DOC_FILE: {roadmap_file}\n\n"
        f"# 路线图输入\n"
        f"- 前端：{item['frontend'] or '待补充'}\n"
        f"- 后端：{item['backend'] or '待补充'}\n"
        f"- 验收：{item['acceptance'] or '待补充'}\n\n"
        f"# 单系统叠加模式：不新增页面文件，仅在统一工作台叠加能力。\n"
        f"API: GET /api{route}\n"
        f"FIELD: {entity}.status string required\n"
    )


def list_request_files(requests_dir):
    if not os.path.isdir(requests_dir):
        return []
    files = [
        os.path.join(requests_dir, name)
        for name in os.listdir(requests_dir)
        if name.lower().endswith(".md") and name.upper().startswith("REQ-")
    ]
    files.sort(key=lambda p: (extract_request_number(p), os.path.basename(p)))
    return files


def is_deprecated_request(path):
    if not os.path.exists(path):
        return False
    with open(path, "r", encoding="utf-8") as f:
        head = f.read(320)
    return "历史策略（多页面）" in head or "[Deprecated]" in head


def request_matches_goal(request_path, goal_req=None, goal_request=None):
    if goal_req is not None and extract_request_number(request_path) >= goal_req:
        return True
    if goal_request:
        req_name = os.path.basename(request_path)
        if goal_request == request_path or goal_request == req_name:
            return True
    return False


def write_stage_report(summary):
    os.makedirs(REPORTS_DIR, exist_ok=True)
    report_id = new_id("stage-report", REPORTS_DIR, ".json")
    json_path = os.path.join(REPORTS_DIR, report_id + ".json")
    md_path = os.path.join(REPORTS_DIR, report_id + ".md")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    lines = [
        f"# 阶段报告 {report_id}",
        "",
        f"- started_at: {summary.get('started_at', '')}",
        f"- finished_at: {summary.get('finished_at', '')}",
        f"- duration_seconds: {summary.get('duration_seconds', 0)}",
        f"- ok: {summary.get('ok')}",
        f"- stop_reason: {summary.get('stop_reason', '')}",
        f"- goal_reached: {summary.get('goal_reached', False)}",
        f"- executed: {summary.get('executed', 0)}",
        f"- failed: {summary.get('failed', 0)}",
        "",
        "## 结果明细",
        "",
        "| # | request | run_id | ok |",
        "|---|---|---|---|",
    ]
    for idx, item in enumerate(summary.get("results", []), start=1):
        req = os.path.basename(item.get("request", ""))
        run_id = item.get("run_id") or "-"
        ok = "true" if item.get("ok") else "false"
        lines.append(f"| {idx} | {req} | {run_id} | {ok} |")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    return json_path, md_path


def _request_title(request_path):
    try:
        req = load_request(request_path)
        return req.get("title", os.path.basename(request_path))
    except Exception:
        return os.path.basename(request_path)


def write_milestone_drafts(summary):
    milestones_dir = os.path.join(DOCS_DIR, "milestones")
    os.makedirs(milestones_dir, exist_ok=True)
    draft_id = new_id("milestone", milestones_dir, ".md")
    prd_path = os.path.join(milestones_dir, f"{draft_id}-PRD.md")
    tech_path = os.path.join(milestones_dir, f"{draft_id}-TECH.md")

    items = summary.get("results", [])
    req_lines = [f"- {os.path.basename(item.get('request', ''))}：{_request_title(item.get('request', ''))}" for item in items]
    req_block = "\n".join(req_lines) if req_lines else "- 无"

    prd = (
        f"# 阶段 PRD 草案（{draft_id}）\n\n"
        f"## 阶段目标\n\n"
        f"- stop_reason: {summary.get('stop_reason', '')}\n"
        f"- goal_reached: {summary.get('goal_reached', False)}\n"
        f"- executed: {summary.get('executed', 0)}\n\n"
        f"## 需求清单\n\n{req_block}\n\n"
        f"## 用户价值\n\n"
        f"- 通过单系统叠加交付能力，避免页面碎片化。\n"
        f"- 保证每轮迭代具备可验证、可回滚能力。\n\n"
        f"## 验收标准\n\n"
        f"- layout gate 通过\n"
        f"- 构建通过\n"
        f"- required 文档齐备\n"
    )

    tech = (
        f"# 阶段技术方案草案（{draft_id}）\n\n"
        f"## 目标\n\n"
        f"- 在统一工作台中叠加功能，不新增 legacy 页面文件。\n"
        f"- 自动注入标准上下文，缺失 required 文档即失败。\n\n"
        f"## 范围\n\n"
        f"- 涉及请求：\n{req_block}\n\n"
        f"## 技术实现要点\n\n"
        f"- pipeline add_pages 仅更新模型与统一页面索引，不创建新 html。\n"
        f"- context_manifest 中 required=true 的文档缺失将阻断 plan/run/autoloop。\n"
        f"- autoloop 结束自动生成阶段报告与文档草案。\n\n"
        f"## 风险与回滚\n\n"
        f"- 风险：历史请求仍可能包含 PAGE 指令。\n"
        f"- 回滚：使用 autoboot rollback 恢复最近 run。\n"
    )

    with open(prd_path, "w", encoding="utf-8") as f:
        f.write(prd)
    with open(tech_path, "w", encoding="utf-8") as f:
        f.write(tech)
    return prd_path, tech_path


def run_single_request(request_path):
    req = load_request(request_path)
    actions = plan_actions(req)
    if not actions:
        return {
            "request": request_path,
            "ok": False,
            "error": "No actions planned. Add keywords frontend/backend/docs in the request.",
            "run_id": None,
            "plan": None,
        }

    context_bundle = build_context_bundle()
    ok_ctx, missing_required = validate_context_bundle(context_bundle)
    if not ok_ctx:
        return {
            "request": request_path,
            "ok": False,
            "error": "required context docs missing",
            "missing_required": missing_required,
            "run_id": None,
            "plan": None,
        }
    plan_id = new_id("plan", PLANS_DIR, ".json")
    plan_path = os.path.join(PLANS_DIR, plan_id + ".json")
    write_plan(plan_path, req, actions, context_bundle)

    run_id = new_id("run", RUNS_DIR)
    apply_actions(actions, run_id, context_bundle)

    ok, checks = verify(actions)
    gate = run_layout_gate()
    final_ok = ok and gate.get("passed", True)
    if not final_ok:
        rollback(run_id)

    return {
        "request": request_path,
        "run_id": run_id,
        "plan": plan_path,
        "context_id": context_bundle.get("context_id"),
        "ok": final_ok,
        "checks": checks,
        "layout_gate": gate,
    }


def cmd_autoloop(args):
    started = datetime.now(timezone.utc)
    requests_dir = os.path.abspath(args.requests_dir)
    req_files = list_request_files(requests_dir)
    if not req_files:
        print(json.dumps({"ok": False, "error": f"No request files found under {requests_dir}"}, ensure_ascii=False, indent=2))
        return 2

    selected = []
    for path in req_files:
        if not args.include_deprecated and is_deprecated_request(path):
            continue
        req_no = extract_request_number(path)
        if args.from_req is not None and req_no < args.from_req:
            continue
        if args.to_req is not None and req_no > args.to_req:
            continue
        selected.append(path)

    if args.resume:
        state = load_state() or {}
        next_req = state.get("autoloop_next_request")
        if next_req and next_req in selected:
            idx = selected.index(next_req)
            selected = selected[idx:]

    if args.max_runs is not None:
        selected = selected[: args.max_runs]

    if not selected:
        print(json.dumps({"ok": True, "message": "No requests to run for current filters."}, ensure_ascii=False, indent=2))
        return 0

    results = []
    overall_ok = True
    stop_reason = "completed"
    goal_reached = False
    for i, req_path in enumerate(selected):
        res = run_single_request(req_path)
        results.append(res)

        next_req = selected[i + 1] if i + 1 < len(selected) else None
        save_state(
            {
                "last_run": res.get("run_id"),
                "plan": res.get("plan"),
                "ok": res.get("ok"),
                "autoloop_last_request": req_path,
                "autoloop_next_request": next_req,
            }
        )

        if not res.get("ok", False):
            overall_ok = False
            stop_reason = "failure"
            if not args.continue_on_failure:
                break

        if request_matches_goal(req_path, goal_req=args.goal_req, goal_request=args.goal_request):
            goal_reached = True
            stop_reason = "goal_reached"
            break

    if args.max_runs is not None and len(results) >= args.max_runs and not goal_reached and stop_reason == "completed":
        stop_reason = "max_runs_reached"
    if len(results) == len(selected) and not goal_reached and stop_reason == "completed":
        stop_reason = "request_queue_exhausted"

    finished = datetime.now(timezone.utc)
    summary = {
        "ok": overall_ok,
        "started_at": started.isoformat().replace("+00:00", "Z"),
        "finished_at": finished.isoformat().replace("+00:00", "Z"),
        "duration_seconds": round((finished - started).total_seconds(), 3),
        "stop_reason": stop_reason,
        "goal_reached": goal_reached,
        "goal_req": args.goal_req,
        "goal_request": args.goal_request,
        "executed": len(results),
        "failed": len([r for r in results if not r.get("ok", False)]),
        "results": results,
    }
    json_report, md_report = write_stage_report(summary)
    prd_draft, tech_draft = write_milestone_drafts(summary)
    summary["report_json"] = json_report
    summary["report_md"] = md_report
    summary["milestone_prd_draft"] = prd_draft
    summary["milestone_tech_draft"] = tech_draft

    last = results[-1] if results else {}
    state = load_state() or {}
    state.update(
        {
            "last_run": last.get("run_id"),
            "plan": last.get("plan"),
            "ok": overall_ok,
            "autoloop_goal_reached": goal_reached,
            "autoloop_stop_reason": stop_reason,
            "autoloop_report_json": json_report,
            "autoloop_report_md": md_report,
            "autoloop_milestone_prd_draft": prd_draft,
            "autoloop_milestone_tech_draft": tech_draft,
        }
    )
    save_state(state)

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if overall_ok else 1


def cmd_gen_requests(args):
    roadmap_file = os.path.abspath(args.roadmap)
    requests_dir = os.path.abspath(args.requests_dir)
    os.makedirs(requests_dir, exist_ok=True)

    versions = parse_roadmap_versions(roadmap_file)
    if not versions:
        print(json.dumps({"ok": False, "error": f"No versions found in roadmap: {roadmap_file}"}, ensure_ascii=False, indent=2))
        return 2

    req_no = args.start_req if args.start_req is not None else next_request_number(requests_dir)
    created = []
    skipped = []

    for item in versions:
        slug = f"{item['version'].lower().replace('.', '-')}-auto"
        filename = f"REQ-{req_no:03d}-{slug}.md"
        req_path = os.path.join(requests_dir, filename)
        if os.path.exists(req_path) and not args.overwrite:
            skipped.append(req_path)
            req_no += 1
            continue

        content = render_request_from_version(item, roadmap_file)
        with open(req_path, "w", encoding="utf-8") as f:
            f.write(content)
        created.append(req_path)
        req_no += 1

    print(json.dumps({"ok": True, "created": created, "skipped": skipped}, ensure_ascii=False, indent=2))
    return 0


def cmd_cleanup_legacy(args):
    legacy_dir = os.path.join(ROOT, "v2", "legacy")
    if not os.path.isdir(legacy_dir):
        print(json.dumps({"ok": True, "mode": "noop", "message": "legacy directory already removed."}, ensure_ascii=False, indent=2))
        return 0

    keep = {"index.html", "login.html", "page.html"}
    pattern = re.compile(r"^v\d+-.*\.html$", re.IGNORECASE)
    candidates = []
    for name in sorted(os.listdir(legacy_dir)):
        if name in keep:
            continue
        if pattern.match(name):
            candidates.append(name)

    if not candidates:
        print(json.dumps({"ok": True, "mode": "noop", "message": "No fragment pages found.", "moved": []}, ensure_ascii=False, indent=2))
        return 0

    archive_id = datetime.now(timezone.utc).strftime("archive-%Y%m%d-%H%M%S")
    archive_dir = os.path.join(legacy_dir, "archive", archive_id)
    moved = []

    if args.apply:
        os.makedirs(archive_dir, exist_ok=True)
        for name in candidates:
            src = os.path.join(legacy_dir, name)
            dst = os.path.join(archive_dir, name)
            shutil.move(src, dst)
            moved.append({"from": src, "to": dst})
        report = {
            "ok": True,
            "mode": "apply",
            "archive_dir": archive_dir,
            "moved_count": len(moved),
            "moved": moved,
        }
    else:
        report = {
            "ok": True,
            "mode": "dry-run",
            "archive_dir": archive_dir,
            "moved_count": len(candidates),
            "moved": [{"from": os.path.join(legacy_dir, name), "to": os.path.join(archive_dir, name)} for name in candidates],
        }

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


def main():
    parser = argparse.ArgumentParser(description="AutoBoot pipeline")
    sub = parser.add_subparsers(dest="cmd")

    p_plan = sub.add_parser("plan", help="Generate a plan from request")
    p_plan.add_argument("--request", required=True)
    p_plan.set_defaults(func=cmd_plan)

    p_apply = sub.add_parser("apply", help="Apply a plan")
    p_apply.add_argument("--plan", required=True)
    p_apply.set_defaults(func=cmd_apply)

    p_verify = sub.add_parser("verify", help="Verify last plan or given plan")
    p_verify.add_argument("--plan")
    p_verify.set_defaults(func=cmd_verify)

    p_rollback = sub.add_parser("rollback", help="Rollback last or given run")
    p_rollback.add_argument("--run")
    p_rollback.set_defaults(func=cmd_rollback)

    p_run = sub.add_parser("run", help="Plan + apply + verify + rollback on failure")
    p_run.add_argument("--request", required=True)
    p_run.set_defaults(func=cmd_run)

    p_autoloop = sub.add_parser("autoloop", help="Run requests sequentially without manual intervention")
    p_autoloop.add_argument("--requests-dir", default=os.path.join(ROOT, "autoboot", "requests"))
    p_autoloop.add_argument("--from", dest="from_req", type=int)
    p_autoloop.add_argument("--to", dest="to_req", type=int)
    p_autoloop.add_argument("--max-runs", type=int)
    p_autoloop.add_argument("--resume", action="store_true")
    p_autoloop.add_argument("--continue-on-failure", action="store_true")
    p_autoloop.add_argument("--include-deprecated", action="store_true", help="Include deprecated request files")
    p_autoloop.add_argument("--goal-req", type=int, help="Auto stop once this request number is executed")
    p_autoloop.add_argument("--goal-request", help="Auto stop when this request path or filename is executed")
    p_autoloop.set_defaults(func=cmd_autoloop)

    p_gen = sub.add_parser("gen-requests", help="Generate request queue from roadmap versions")
    p_gen.add_argument("--roadmap", default=os.path.join(ROOT, "docs", "30-版本目标迭代计划.md"))
    p_gen.add_argument("--requests-dir", default=os.path.join(ROOT, "autoboot", "requests"))
    p_gen.add_argument("--start-req", type=int)
    p_gen.add_argument("--overwrite", action="store_true")
    p_gen.set_defaults(func=cmd_gen_requests)

    p_cleanup = sub.add_parser("cleanup-legacy", help="Archive legacy fragment pages when legacy directory exists (deprecated)")
    p_cleanup.add_argument("--apply", action="store_true", help="Apply move to archive directory (default is dry-run)")
    p_cleanup.set_defaults(func=cmd_cleanup_legacy)

    args = parser.parse_args()
    if not args.cmd:
        parser.print_help()
        return 2
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
