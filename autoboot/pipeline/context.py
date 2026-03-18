import json
import os

from .constants import ROOT, CONTEXT_DIR, CONTEXT_MANIFEST_FILE
from .utils import new_id, _shorten


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
