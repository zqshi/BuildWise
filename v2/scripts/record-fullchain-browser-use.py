#!/usr/bin/env python3
import argparse
import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Any

import imageio.v3 as iio
from browser_use import BrowserSession


async def text_of(el) -> str:
    try:
        text = await el.evaluate('() => (this.textContent || "").trim()')
        return str(text).strip()
    except Exception:
        return ""


async def click_button_contains(page, keyword: str) -> bool:
    buttons = await page.get_elements_by_css_selector("button")
    for btn in buttons:
        label = await text_of(btn)
        if keyword in label:
            await btn.click()
            return True
    return False


async def click_any_button_contains(page, keywords: list[str], selectors: list[str] | None = None) -> bool:
    selector_list = selectors or ["button"]
    for selector in selector_list:
        buttons = await page.get_elements_by_css_selector(selector)
        for btn in buttons:
            label = await text_of(btn)
            if any(keyword in label for keyword in keywords):
                await btn.click()
                return True
    return False


async def click_button_contains_in_scope(page, scope_selector: str, keyword: str) -> bool:
    script = f"""
    () => {{
      const root = document.querySelector({json.dumps(scope_selector)});
      if (!root) return false;
      const buttons = Array.from(root.querySelectorAll('button'));
      const target = buttons.find(btn => (btn.textContent || '').includes({json.dumps(keyword)}));
      if (!target) return false;
      target.click();
      return true;
    }}
    """
    try:
      return bool(await page.evaluate(script))
    except Exception:
      return False


async def exists_selector(page, selector: str) -> bool:
    script = f"() => Boolean(document.querySelector({json.dumps(selector)}))"
    try:
        return bool(await page.evaluate(script))
    except Exception:
        return False


async def click_by_title(page, title: str) -> bool:
    script = f"""
    () => {{
      const target = document.querySelector({json.dumps(f'button[title="{title}"]')});
      if (!target) return false;
      target.click();
      return true;
    }}
    """
    try:
        return bool(await page.evaluate(script))
    except Exception:
        return False


async def click_project(page, project_name: str) -> bool:
    buttons = await page.get_elements_by_css_selector(".project-list button, .project-shell .project-list button, .projects-workspace .project-list button")
    for btn in buttons:
        label = await text_of(btn)
        if project_name in label:
            await btn.click()
            return True
    return False


async def click_iteration(page, iteration_prefix: str) -> str:
    buttons = await page.get_elements_by_css_selector(
        ".iteration-list li button, .project-workspace-shell .iteration-list li button, .project-overview .iteration-list li button"
    )
    for btn in buttons:
        label = await text_of(btn)
        if iteration_prefix in label:
            await btn.click()
            return label.split("\n", 1)[0].strip()
    if buttons:
        await buttons[0].click()
        return (await text_of(buttons[0])).split("\n", 1)[0].strip()
    return ""


async def type_into_quill(page, content: str) -> bool:
    for _ in range(10):
        inserted = await page.evaluate(
            """
            (content) => {
              const editor = document.querySelector('.interaction-drawer .quill-rich-editor .ql-editor');
              if (!editor) return false;
              const container = editor.closest('.ql-container');
              const quill = (container && container.__quill) || editor.__quill || null;
              if (quill && typeof quill.setText === 'function') {
                quill.focus();
                quill.setText(content);
                return true;
              }
              editor.textContent = content;
              editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
              editor.dispatchEvent(new Event('change', { bubbles: true }));
              return true;
            }
            """,
            content,
        )
        if inserted:
            return True
        await asyncio.sleep(0.5)
    return False


async def run(args: argparse.Namespace) -> dict[str, Any]:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = Path(args.recordings_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / f"record-fullchain-browser-use-{stamp}.json"

    result: dict[str, Any] = {
        "ok": False,
        "baseUrl": args.base_url,
        "projectName": args.project_name,
        "iterationPrefix": args.iteration_prefix,
        "report": str(report_path),
        "actions": {},
        "error": "",
    }

    session = BrowserSession(headless=args.headless, record_video_dir=out_dir)
    try:
        await session.start()
        await session.navigate_to(args.base_url)
        await asyncio.sleep(2.0)
        page = await session.must_get_current_page()
        if args.auto_auth:
            await page.evaluate(
                """
                () => {
                  localStorage.setItem("buildwise:auth", "logged_in");
                  localStorage.setItem("buildwise:auth-role", "owner");
                  localStorage.setItem("buildwise:active-view", "dashboard");
                  if (!window.location.hash || window.location.hash === "#/login") {
                    window.location.hash = "/dashboard";
                  }
                }
                """
            )
            await session.navigate_to(args.base_url)
            await asyncio.sleep(1.6)
            page = await session.must_get_current_page()

        # Force iteration workspace mode to ensure right drawer flow is visible.
        await page.evaluate("() => localStorage.setItem('buildwise:project-panel-mode', 'iteration')")
        await session.navigate_to(args.base_url)
        await asyncio.sleep(2.0)
        page = await session.must_get_current_page()

        result["actions"]["openedWorkspace"] = (
            await click_button_contains(page, "查看项目工作台")
            or await click_button_contains(page, "项目工作台")
            or await click_by_title(page, "项目库")
        )
        if not result["actions"]["openedWorkspace"]:
            result["actions"]["openedWorkspace"] = await exists_selector(page, ".project-shell, .projects-workspace, .project-list")
        await asyncio.sleep(1.8)
        selected_project = await click_project(page, args.project_name)
        if not selected_project:
            selected_project = await exists_selector(page, ".iteration-list li button")
        result["actions"]["selectedProject"] = selected_project
        await asyncio.sleep(1.2)
        result["actions"]["selectedIteration"] = await click_iteration(page, args.iteration_prefix)
        if not result["actions"]["selectedIteration"]:
            selected = await exists_selector(page, ".interaction-drawer, .deliverable-panel, .iteration-detail, .workspace-detail")
            if selected:
                result["actions"]["selectedIteration"] = "(current-iteration)"
        await asyncio.sleep(1.5)

        result["actions"]["openedDrawer"] = await click_any_button_contains(
            page,
            ["交付物列表", "交付物", "Deliverables", "查看详情"],
            [".project-workspace-shell button", ".workspace-detail button", "button"],
        )
        if not result["actions"]["openedDrawer"]:
            result["actions"]["openedDrawer"] = await exists_selector(
                page,
                ".interaction-drawer.open, .interaction-drawer .preview-scroll, .deliverable-detail-panel",
            )
        await asyncio.sleep(1.2)

        # Choose a deliverable in right drawer.
        opened_deliverable = await click_any_button_contains(
            page,
            ["查看详情", "详情", "Detail"],
            [".interaction-drawer button", ".deliverable-list button", "button"],
        )
        if not opened_deliverable:
            opened_deliverable = await exists_selector(
                page,
                ".interaction-drawer .preview-scroll, .interaction-drawer .deliverable-detail, .deliverable-detail-panel",
            )
        result["actions"]["openedDeliverableDetail"] = opened_deliverable
        await asyncio.sleep(0.8)

        await page.evaluate(
            "() => { const box = document.querySelector('.interaction-drawer .preview-scroll'); if (box) box.scrollTop = Math.max(0, box.scrollHeight * 0.2); }"
        )
        await asyncio.sleep(0.5)
        result["actions"]["enteredEditMode"] = await click_button_contains_in_scope(page, ".interaction-drawer", "编辑")
        await asyncio.sleep(0.8)

        typed = await type_into_quill(
            page,
            "全链路录制：补充需求澄清要点，需同步影响审批列表、会签时间线、验收规则。\n参考链接：https://example.com/prototype-v4.html",
        )
        result["actions"]["typedInQuill"] = typed
        await asyncio.sleep(0.8)

        await page.evaluate(
            "() => { const box = document.querySelector('.interaction-drawer .preview-scroll'); if (box) box.scrollTop = box.scrollHeight; }"
        )
        await asyncio.sleep(0.6)
        result["actions"]["savedDraft"] = await click_button_contains_in_scope(page, ".interaction-drawer", "保存草稿")
        await asyncio.sleep(1.0)
        result["actions"]["committed"] = await click_button_contains_in_scope(page, ".interaction-drawer", "提交变更") or await click_button_contains_in_scope(
            page, ".interaction-drawer", "提交"
        )
        await asyncio.sleep(1.0)
        result["actions"]["addedToChat"] = await click_button_contains_in_scope(page, ".interaction-drawer", "添加到会话澄清")
        await asyncio.sleep(1.0)
        result["actions"]["confirmed"] = await click_button_contains_in_scope(page, ".interaction-drawer", "确认通过")
        await asyncio.sleep(1.0)

        # Try stage transition if current stage allows.
        transition_clicked = False
        buttons = await page.get_elements_by_css_selector(".interaction-drawer button")
        for btn in buttons:
            label = await text_of(btn)
            if label.startswith("流转到"):
                await btn.click()
                transition_clicked = True
                break
        result["actions"]["transitionClicked"] = transition_clicked
        await asyncio.sleep(1.5)

        # Keep the timeline visible for easier human review in video.
        await page.evaluate(
            "() => { const box = document.querySelector('.interaction-drawer .preview-scroll'); if (box) box.scrollTop = box.scrollHeight; }"
        )
        await asyncio.sleep(1.5)

        result["ok"] = bool(
            result["actions"]["openedWorkspace"]
            and result["actions"]["selectedProject"]
            and bool(result["actions"]["selectedIteration"])
            and result["actions"]["openedDrawer"]
            and result["actions"]["openedDeliverableDetail"]
            and result["actions"]["typedInQuill"]
            and result["actions"]["savedDraft"]
            and result["actions"]["committed"]
        )
    except Exception as error:  # noqa: BLE001
        result["error"] = str(error)
    finally:
        try:
            await session.stop()
        except Exception:
            pass

    videos = sorted(str(p) for p in out_dir.glob("*.mp4"))
    if videos:
        latest = videos[-1]
        result["latestVideo"] = latest
        try:
            meta = iio.immeta(latest)
            result["videoMeta"] = {
                "duration": float(meta.get("duration", 0.0) or 0.0),
                "fps": float(meta.get("fps", 0.0) or 0.0),
                "size": meta.get("size"),
            }
        except Exception as error:  # noqa: BLE001
            result["videoMetaError"] = str(error)

    report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="BuildWise 全链路 browser-use 录制")
    parser.add_argument("--base-url", default="http://127.0.0.1:5173")
    parser.add_argument("--project-name", default="全链路真实演示项目-20260304110136")
    parser.add_argument("--iteration-prefix", default="版本迭代-3-20260304141102")
    parser.add_argument(
        "--recordings-dir",
        default="/Users/zqs/Downloads/project/BuildWise/v2/backend/.runtime/recordings",
    )
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--auto-auth", action="store_true", default=True)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result = asyncio.run(run(args))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
