#!/usr/bin/env python3
import argparse
import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Any

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


async def click_projects_entry(page) -> bool:
    via_text = await click_button_contains(page, "查看项目工作台") or await click_button_contains(page, "项目工作台")
    if via_text:
        return True
    try:
        items = await page.get_elements_by_css_selector("button[title='项目库']")
        if items:
            await items[0].click()
            return True
    except Exception:
        return False
    return False


async def run(args: argparse.Namespace) -> dict[str, Any]:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = Path(args.recordings_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / f"verify-deliverable-panel-{stamp}.json"

    result: dict[str, Any] = {
        "ok": False,
        "baseUrl": args.base_url,
        "projectName": args.project_name,
        "iterationPrefix": args.iteration_prefix,
        "error": "",
        "report": str(report_path),
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

        opened_workspace = await click_projects_entry(page)
        await asyncio.sleep(2.0)

        selected_project = False
        if args.project_name:
            project_buttons = await page.get_elements_by_css_selector(".project-list button")
            for btn in project_buttons:
                txt = await text_of(btn)
                if args.project_name in txt:
                    await btn.click()
                    selected_project = True
                    await asyncio.sleep(1.5)
                    break
        if not selected_project:
            first_project = await page.get_elements_by_css_selector(".project-list button")
            if first_project:
                await first_project[0].click()
                selected_project = True
                await asyncio.sleep(1.2)

        selected_iteration = ""
        iteration_buttons = await page.get_elements_by_css_selector(".project-version-row button, .project-version-row, .iteration-list li button")
        for btn in iteration_buttons:
            txt = await text_of(btn)
            if args.iteration_prefix in txt:
                await btn.click()
                await asyncio.sleep(1.2)
                selected_iteration = txt.split("\n", 1)[0].strip()
                break
        if not selected_iteration and iteration_buttons:
            await iteration_buttons[0].click()
            await asyncio.sleep(1.0)
            selected_iteration = (await text_of(iteration_buttons[0])).split("\n", 1)[0].strip() or "(first-iteration)"

        # Force iteration workspace mode so "deliverable -> right drawer" flow is visible.
        await page.evaluate(
            "() => localStorage.setItem('buildwise:project-panel-mode', 'iteration')"
        )
        await session.navigate_to(args.base_url)
        await asyncio.sleep(1.8)
        page = await session.must_get_current_page()
        await click_projects_entry(page)
        await asyncio.sleep(1.8)

        opened_deliverable_drawer = await click_button_contains(page, "右侧查看详情") or await click_button_contains(page, "查看详情")
        await asyncio.sleep(1.2)

        h2s = await page.get_elements_by_css_selector(".analysis-drawer h2")
        h2_texts = [await text_of(el) for el in h2s]
        has_analysis_drawer = any("分析报告" in t for t in h2_texts)

        h3s = await page.get_elements_by_css_selector(".analysis-drawer h3")
        h3_texts = [await text_of(el) for el in h3s]
        has_deliverable_detail = any("测试与验收产物" in t or "版本差异" in t or "优先级发现" in t for t in h3_texts)
        has_conversation_detail = any("出发点确认" in t or "项目概要确认" in t for t in h3_texts)
        hint_texts = [await text_of(el) for el in await page.get_elements_by_css_selector(".analysis-drawer .hint, .analysis-drawer p")]
        has_empty_analysis_hint = any("暂无分析结果" in t for t in hint_texts)

        conversation_items = await page.get_elements_by_css_selector(".analysis-drawer .history-item")
        deliverable_items = await page.get_elements_by_css_selector(".analysis-drawer .deliverable-item, .analysis-drawer .history-item")

        # Try one more interaction from chat event button
        clicked_msg_entry = await click_button_contains(page, "查看详情") or await click_button_contains(page, "查看分析报告")
        await asyncio.sleep(0.8)

        ok = (
            opened_workspace
            and selected_project
            and bool(selected_iteration)
            and opened_deliverable_drawer
            and has_analysis_drawer
            and (
                has_empty_analysis_hint
                or (
                    has_deliverable_detail
                    and has_conversation_detail
                    and len(deliverable_items) > 0
                    and len(conversation_items) > 0
                )
            )
        )
        result.update(
            {
                "ok": ok,
                "openedWorkspace": opened_workspace,
                "selectedProject": selected_project,
                "selectedIteration": selected_iteration,
                "openedDeliverableDrawer": opened_deliverable_drawer,
                "clickedMessageDeliverableEntry": clicked_msg_entry,
                "hasAnalysisDrawer": has_analysis_drawer,
                "hasDeliverableDetail": has_deliverable_detail,
                "hasConversationDetail": has_conversation_detail,
                "hasEmptyAnalysisHint": has_empty_analysis_hint,
                "deliverableItemCount": len(deliverable_items),
                "conversationItemCount": len(conversation_items),
            }
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
        result["latestVideo"] = videos[-1]

    report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="验证交付物点击后右侧面板交互")
    parser.add_argument("--base-url", default="http://127.0.0.1:5176")
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
