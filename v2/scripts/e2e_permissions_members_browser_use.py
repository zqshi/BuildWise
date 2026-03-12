#!/usr/bin/env python3
"""
Browser-use 用户视角专项复测：
1) 自动注入 owner 登录态并进入工作台
2) 打开用户菜单进入「权限管理」
3) 分别校验「成员管理」「角色权限」页签无 API error 文案
4) 输出 JSON 报告与页面截图
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
        raw = await el.evaluate('() => (this.textContent || "").trim()')
        return str(raw).strip()
    except Exception:
        return ""


async def click_first(page, selector: str) -> bool:
    try:
        items = await page.get_elements_by_css_selector(selector)
        if not items:
            return False
        await items[0].click()
        return True
    except Exception:
        return False


async def click_button_by_text(page, keyword: str) -> bool:
    buttons = await page.get_elements_by_css_selector("button")
    for btn in buttons:
        txt = await text_of(btn)
        if keyword in txt:
            await btn.click()
            return True
    return False


async def collect_page_state(page) -> dict[str, Any]:
    raw = await page.evaluate(
        """
        () => {
          const bodyText = (document.body?.innerText || "").trim();
          const notice = document.querySelector(".permissions-notice")?.textContent?.trim() || "";
          const hasPermissionsRoot = !!document.querySelector(".permissions-page");
          const activeTab = document.querySelector(".permissions-tab.active")?.textContent?.trim() || "";
          const hasApiErrorText = bodyText.includes("API error");
          const hasCustomRole404 = bodyText.includes("Route not found: GET /api/governance/custom_roles");
          return { hasPermissionsRoot, activeTab, notice, hasApiErrorText, hasCustomRole404 };
        }
        """
    )
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return {
                "hasPermissionsRoot": "permissions-page" in raw,
                "activeTab": "",
                "notice": raw[:500],
                "hasApiErrorText": "API error" in raw,
                "hasCustomRole404": "Route not found: GET /api/governance/custom_roles" in raw,
            }
    return {
        "hasPermissionsRoot": False,
        "activeTab": "",
        "notice": "",
        "hasApiErrorText": False,
        "hasCustomRole404": False,
    }


async def run_check(args: argparse.Namespace) -> dict[str, Any]:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = Path(args.output_dir).expanduser().resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    screenshot_path = out_dir / f"permissions-members-{stamp}.png"
    report_path = out_dir / f"permissions-members-{stamp}.json"

    session = BrowserSession(headless=args.headless, record_video_dir=out_dir)
    result: dict[str, Any] = {
      "ok": False,
      "baseUrl": args.base_url,
      "report": str(report_path),
      "screenshot": str(screenshot_path),
      "error": ""
    }

    try:
        await session.start()
        await session.navigate_to(args.base_url)
        await asyncio.sleep(1.4)
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

        opened_user_menu = await click_first(page, ".dock-avatar-btn")
        if not opened_user_menu:
            raise RuntimeError("无法打开用户菜单（.dock-avatar-btn 未找到）")
        await asyncio.sleep(0.5)

        opened_permissions = await click_button_by_text(page, "权限管理")
        if not opened_permissions:
            raise RuntimeError("无法进入权限管理（权限管理按钮未找到）")
        await asyncio.sleep(1.5)

        roles_tab_clicked = await click_button_by_text(page, "角色权限")
        await asyncio.sleep(0.8)
        roles_state = await collect_page_state(page)

        members_tab_clicked = await click_button_by_text(page, "成员管理")
        await asyncio.sleep(0.8)
        members_state = await collect_page_state(page)

        await session.take_screenshot(path=str(screenshot_path), full_page=True)

        ok = (
            roles_tab_clicked
            and members_tab_clicked
            and roles_state.get("hasPermissionsRoot")
            and members_state.get("hasPermissionsRoot")
            and not roles_state.get("hasApiErrorText")
            and not members_state.get("hasApiErrorText")
            and not roles_state.get("hasCustomRole404")
            and not members_state.get("hasCustomRole404")
        )

        result.update(
            {
                "ok": ok,
                "openedUserMenu": opened_user_menu,
                "openedPermissions": opened_permissions,
                "rolesTabClicked": roles_tab_clicked,
                "membersTabClicked": members_tab_clicked,
                "rolesState": roles_state,
                "membersState": members_state,
                "final": (
                    "RESULT: PASS - 权限管理/成员管理页面未检测到 API error。"
                    if ok
                    else "RESULT: FAIL - 权限管理/成员管理页面仍存在异常。"
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

    videos = sorted(str(p) for p in out_dir.glob("*.mp4"))
    if videos:
        result["latestVideo"] = videos[-1]
    report_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="权限管理/成员管理 browser-use 专项复测")
    parser.add_argument("--base-url", default="http://127.0.0.1:5173", help="前端访问地址")
    parser.add_argument("--output-dir", default="/Users/zqs/Downloads/project/BuildWise/v2/backend/.runtime/recordings", help="输出目录")
    parser.add_argument("--headless", action="store_true", help="无头模式")
    parser.add_argument("--auto-auth", action="store_true", default=True, help="自动注入登录态")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result = asyncio.run(run_check(args))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
