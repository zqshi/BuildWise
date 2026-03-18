import json
import os

from .constants import REPORTS_DIR, DOCS_DIR
from .request import load_request
from .utils import new_id


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
