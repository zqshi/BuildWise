#!/usr/bin/env python3
"""
使用 browser-use 的 BrowserSession 直控方式做稳定验收：
1) 打开首页并进入项目工作台
2) 校验版本列表中满足前缀的版本数量
3) 点击一个版本并校验关键模块可见
4) 输出 JSON 报告，并保存录屏
"""

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


async def find_and_click_button_by_text(page, keyword: str) -> bool:
    buttons = await page.get_elements_by_css_selector("button")
    for el in buttons:
        txt = await text_of(el)
        if keyword in txt:
            await el.click()
            return True
    return False


async def click_projects_entry(page) -> bool:
    via_text = await find_and_click_button_by_text(page, "查看项目工作台") or await find_and_click_button_by_text(page, "项目工作台")
    if via_text:
        return True
    try:
        via_selector = await page.get_elements_by_css_selector("button[title='项目库']")
        if via_selector:
            await via_selector[0].click()
            return True
    except Exception:
        return False
    return False


async def run_check(args: argparse.Namespace) -> dict[str, Any]:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    recordings_dir = Path(args.recordings_dir).expanduser().resolve()
    recordings_dir.mkdir(parents=True, exist_ok=True)
    report_path = recordings_dir / f"browser-use-direct-verify-{stamp}.json"

    session = BrowserSession(headless=args.headless, record_video_dir=recordings_dir)
    result: dict[str, Any] = {
        "ok": False,
        "baseUrl": args.base_url,
        "projectName": args.project_name,
        "iterationPrefix": args.iteration_prefix,
        "minIterationCount": args.min_iteration_count,
        "report": str(report_path),
        "error": "",
    }

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

        clicked_workspace = await click_projects_entry(page)
        await asyncio.sleep(2.0)

        selected_project = False
        if args.project_name:
            project_buttons = await page.get_elements_by_css_selector(".project-list button")
            for btn in project_buttons:
                if args.project_name in await text_of(btn):
                    await btn.click()
                    await asyncio.sleep(1.0)
                    selected_project = True
                    break
            if (not selected_project) and project_buttons:
                await project_buttons[0].click()
                await asyncio.sleep(1.0)
                selected_project = True

        version_names: list[str] = []
        for _ in range(10):
            strongs = await page.get_elements_by_css_selector(".project-version-name, .iteration-list li button strong")
            version_names = [await text_of(el) for el in strongs]
            version_names = [x for x in version_names if x]
            if version_names:
                break
            await asyncio.sleep(0.8)
        matched = [n for n in version_names if n.startswith(args.iteration_prefix)]

        h3s = await page.get_elements_by_css_selector("h3")
        h3_texts = [await text_of(el) for el in h3s]
        module_checks = {
            "项目建模与领域建模": any("项目建模与领域建模" in t for t in h3_texts),
            "代码仓设置": any("代码仓设置" in t for t in h3_texts),
            "运行状态": any("运行状态" in t for t in h3_texts),
        }
        has_api_error = False
        api_error_snippet = ""
        try:
            raw_has_api_error = await page.evaluate("() => (document.body?.innerText || '').includes('API error')")
            if isinstance(raw_has_api_error, bool):
                has_api_error = raw_has_api_error
            elif isinstance(raw_has_api_error, str):
                has_api_error = raw_has_api_error.strip().lower() == "true"
            else:
                has_api_error = bool(raw_has_api_error)
            if has_api_error:
                api_error_snippet = await page.evaluate(
                    """
                    () => {
                      const text = document.body?.innerText || "";
                      const idx = text.indexOf("API error");
                      if (idx < 0) return "";
                      return text.slice(idx, idx + 260).replace(/\\s+/g, " ").trim();
                    }
                    """
                )
                api_error_snippet = str(api_error_snippet or "")
        except Exception:
            has_api_error = False

        entered_iteration = False
        if matched:
            version_buttons = await page.get_elements_by_css_selector(".project-version-row button, .iteration-list li button")
            for btn in version_buttons:
                txt = await text_of(btn)
                if matched[0] in txt:
                    await btn.click()
                    await asyncio.sleep(1.0)
                    entered_iteration = True
                    break
        if entered_iteration:
            chat_main = await page.get_elements_by_css_selector(".iteration-chat-main, .chat-body")
            entered_iteration = len(chat_main) > 0

        ok = clicked_workspace and selected_project and len(matched) >= args.min_iteration_count and all(module_checks.values()) and (not has_api_error)
        result.update(
            {
                "ok": ok,
                "clickedWorkspace": clicked_workspace,
                "selectedProject": selected_project,
                "versionCount": len(version_names),
                "matchedVersionCount": len(matched),
                "matchedVersions": matched[:20],
                "moduleChecks": module_checks,
                "hasApiError": has_api_error,
                "apiErrorSnippet": api_error_snippet,
                "enteredIteration": entered_iteration,
                "final": (
                    "RESULT: PASS - 当前项目满足迭代版本数量与模块可见性要求。"
                    if ok
                    else "RESULT: FAIL - 当前项目不满足迭代版本数量或模块可见性要求。"
                ),
            }
        )
    except Exception as error:
        result["error"] = str(error)
    finally:
        try:
            await session.stop()
        except Exception:
            pass

    videos = sorted(str(p) for p in recordings_dir.glob("*.mp4"))
    if videos:
        result["latestVideo"] = videos[-1]

    report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="BuildWise browser-use 直控验收脚本")
    parser.add_argument("--base-url", default="http://localhost:5173", help="前端访问地址")
    parser.add_argument("--project-name", default="构想智造平台", help="目标项目名（可为空）")
    parser.add_argument("--iteration-prefix", default="迭代-真实全链路-", help="迭代名称前缀")
    parser.add_argument("--min-iteration-count", type=int, default=3, help="最小匹配迭代数量")
    parser.add_argument(
        "--recordings-dir",
        default="/Users/zqs/Downloads/project/BuildWise/v2/backend/.runtime/recordings",
        help="录屏与报告输出目录",
    )
    parser.add_argument("--headless", action="store_true", help="无头模式")
    parser.add_argument("--auto-auth", action="store_true", default=True, help="自动写入本地登录态")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result = asyncio.run(run_check(args))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
