import argparse
import json
import os
import re
import shutil
import sys
from datetime import datetime, timezone

from .constants import ROOT, PLANS_DIR, RUNS_DIR
from .context import build_context_bundle, validate_context_bundle
from .engine import (
    apply_actions,
    load_state,
    plan_actions,
    rollback,
    run_layout_gate,
    save_state,
    verify,
)
from .reporting import write_milestone_drafts, write_stage_report
from .request import (
    extract_request_number,
    is_deprecated_request,
    list_request_files,
    load_request,
    next_request_number,
    parse_roadmap_versions,
    render_request_from_version,
    request_matches_goal,
)
from .scaffold import write_plan
from .utils import new_id


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
