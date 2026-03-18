import json
import os
import shutil
from datetime import datetime, timezone

from .constants import ROOT, STATE_FILE, RUNS_DIR, PLANS_DIR, MODEL_FILE, LAYOUT_GATE_FILE
from .model import load_model, save_model
from .scaffold import (
    insert_frontend_notice,
    update_backend,
    ensure_backend_readme,
    append_doc_section,
    write_plan,
)
from .utils import new_id, slugify


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
