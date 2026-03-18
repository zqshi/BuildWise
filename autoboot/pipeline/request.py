import os
import re

from .constants import DOCS_DIR, PLANS_DIR
from .utils import new_id


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
