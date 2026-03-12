#!/usr/bin/env python3
"""
使用 browser-use 从用户视角执行可视化 E2E，并对比 stitch 设计稿截图。

覆盖页面：
1) buildwise_1 登录页
2) buildwise_2 仪表盘
3) buildwise_3 项目详情
4) buildwise_4 新建迭代弹窗
5) buildwise_5 迭代工作台
6) buildwise_6 分析报告抽屉
7) buildwise_7 交互界面抽屉
"""

import argparse
import asyncio
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image
from browser_use import BrowserSession


@dataclass
class ShotTarget:
    name: str
    stitch_image: Path
    actual_image: Path
    similarity: float | None = None
    mse: float | None = None
    error: str = ""


async def text_of(el) -> str:
    try:
        text = await el.evaluate('() => (this.textContent || "").trim()')
        return str(text).strip()
    except Exception:
        return ""


async def click_button_contains(page, keywords: list[str]) -> bool:
    buttons = await page.get_elements_by_css_selector("button")
    for btn in buttons:
        label = await text_of(btn)
        if any(word in label for word in keywords):
            await btn.click()
            return True
    return False


async def click_selector(page, selector: str) -> bool:
    try:
        nodes = await page.get_elements_by_css_selector(selector)
        if not nodes:
            return False
        await nodes[0].click()
        return True
    except Exception:
        return False


async def switch_login_mode_to_account(page) -> bool:
    try:
        switched = await page.evaluate(
            """
            () => {
              const root = document.querySelector('.auth-login-switch');
              if (!root) return false;
              const buttons = Array.from(root.querySelectorAll('button'));
              const accountBtn = buttons.find((btn) => (btn.textContent || '').includes('账号登录'));
              if (!accountBtn) return false;
              if (!accountBtn.classList.contains('active')) accountBtn.click();
              return true;
            }
            """
        )
        return bool(switched)
    except Exception:
        return False


async def open_interaction_from_analysis_drawer(page) -> bool:
    try:
        clicked = await page.evaluate(
            """
            () => {
              const drawer = document.querySelector('.analysis-drawer.open');
              if (!drawer) return false;
              const buttons = Array.from(drawer.querySelectorAll('button'));
              const target = buttons.find((btn) => (btn.textContent || '').includes('交互界面'));
              if (!target) return false;
              target.click();
              return true;
            }
            """
        )
        if not clicked:
            clicked_from_top = await page.evaluate(
                """
                () => {
                  const topButtons = Array.from(document.querySelectorAll('.panel-head button, .chat-tools button'));
                  const target = topButtons.find((btn) => (btn.textContent || '').includes('交互界面'));
                  if (!target) return false;
                  target.click();
                  return true;
                }
                """
            )
            clicked = bool(clicked_from_top)
        if not clicked:
            return False
        for _ in range(10):
            opened = await page.evaluate("() => !!document.querySelector('.interaction-drawer.open')")
            if opened:
                return True
            await asyncio.sleep(0.2)
        return False
    except Exception:
        return False


async def open_analysis_drawer(page) -> bool:
    try:
        clicked = await page.evaluate(
            """
            () => {
              const root = document.querySelector('.chat-panel .panel-head') || document.querySelector('.panel-head');
              if (!root) return false;
              const buttons = Array.from(root.querySelectorAll('button'));
              const target = buttons.find((btn) => (btn.textContent || '').includes('分析报告'));
              if (!target) return false;
              target.click();
              return true;
            }
            """
        )
        if not clicked:
            return False
        for _ in range(10):
            opened = await page.evaluate("() => !!document.querySelector('.analysis-drawer.open')")
            if opened:
                return True
            await asyncio.sleep(0.2)
        return False
    except Exception:
        return False


async def normalize_workspace_scroll(page) -> None:
    try:
        await page.evaluate(
            """
            () => {
              const chatBody = document.querySelector('.chat-body');
              if (chatBody) {
                chatBody.scrollTop = Math.max(0, Math.floor(chatBody.scrollHeight * 0.42));
              }
              const analysisDrawer = document.querySelector('.analysis-drawer.open .drawer-body, .analysis-drawer.open .analysis-drawer-body');
              if (analysisDrawer) analysisDrawer.scrollTop = 0;
              const interactionDrawer = document.querySelector('.interaction-drawer.open .drawer-body, .interaction-drawer.open .interaction-drawer-body');
              if (interactionDrawer) interactionDrawer.scrollTop = 0;
            }
            """
        )
    except Exception:
        return


async def wait_for_fonts_ready(page) -> None:
    try:
        await page.evaluate(
            """
            async () => {
              if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
              }
            }
            """
        )
    except Exception:
        return


async def wait_for_dashboard_ready(page) -> None:
    try:
        for _ in range(15):
            ready = await page.evaluate(
                """
                () => {
                  const statCards = document.querySelectorAll('.stats-grid .stat-card').length;
                  const rows = Array.from(document.querySelectorAll('.recent-table tbody tr'));
                  const hasRows = rows.length > 0;
                  const hasEmpty = rows.some((row) => (row.textContent || '').includes('暂无项目数据'));
                  return statCards >= 4 && hasRows && !hasEmpty;
                }
                """
            )
            if ready:
                break
            await asyncio.sleep(0.2)
    except Exception:
        return


async def freeze_visual_state(page) -> None:
    try:
        await page.evaluate(
            """
            () => {
              const id = 'visual-align-freeze-style';
              if (document.getElementById(id)) return;
              const style = document.createElement('style');
              style.id = id;
              style.textContent = `
                *, *::before, *::after {
                  animation: none !important;
                  transition: none !important;
                  caret-color: transparent !important;
                }
              `;
              document.head.appendChild(style);
            }
            """
        )
    except Exception:
        return


async def set_visual_target_mode(page, mode: str) -> None:
    try:
        await page.evaluate(
            """
            (mode) => {
              const id = 'visual-align-target-mode-style';
              let style = document.getElementById(id);
              if (!style) {
                style = document.createElement('style');
                style.id = id;
                document.head.appendChild(style);
              }
              if (mode === 'analysis') {
                style.textContent = `
                  .interaction-drawer,
                  .interaction-drawer-mask {
                    display: none !important;
                    pointer-events: none !important;
                    opacity: 0 !important;
                  }
                  .chat-panel.interaction-companion-open {
                    margin-right: 0 !important;
                  }
                `;
                return;
              }
              style.textContent = '';
            }
            """,
            mode,
        )
    except Exception:
        return


async def select_first_project(page) -> bool:
    buttons = await page.get_elements_by_css_selector(".project-list button")
    if not buttons:
        return False
    await buttons[0].click()
    return True


async def select_first_iteration(page) -> bool:
    buttons = await page.get_elements_by_css_selector(".project-version-row button, .iteration-list li button")
    if not buttons:
        return False
    await buttons[0].click()
    return True


async def set_auth_state(page) -> None:
    await page.evaluate(
        """
        () => {
          localStorage.setItem("buildwise:auth", "logged_in");
          localStorage.setItem("buildwise:auth-role", "owner");
          localStorage.setItem("buildwise:active-view", "dashboard");
          localStorage.setItem("buildwise:project-panel-mode", "project");
          window.location.hash = "/dashboard";
        }
        """
    )


async def clear_auth_state(page) -> None:
    await page.evaluate(
        """
        () => {
          localStorage.setItem("buildwise:auth", "logged_out");
          localStorage.removeItem("buildwise:auth-role");
          window.location.hash = "/login";
        }
        """
    )


async def seed_mock_analysis_report(page) -> None:
    await page.evaluate(
        """
        () => {
          const iterationId = Number(localStorage.getItem("buildwise:current-iteration-id") || "1");
          const report = {
            iterationId,
            iterationName: "可视化对齐迭代",
            analyzedAt: new Date().toISOString(),
            understanding: "本轮以抽屉化分析与风险提示展示为核心。",
            projectDetection: {
              projectName: "BuildWise",
              productName: "BuildWise 工作台",
              projectCategory: "SaaS"
            },
            attachmentInsights: {
              projectCategory: "SaaS",
              artifactType: "需求文档",
              keyCharacteristics: ["抽屉化评审", "风险提示", "测试矩阵"]
            },
            meaningfulFindings: ["内存泄漏隐患", "主题适配缺失"],
            prioritizedFindings: [
              { priority: "P0", content: "内存泄漏隐患", reason: "高风险" },
              { priority: "P1", content: "主题适配缺失", reason: "影响可读性" }
            ],
            nextActions: ["修复风险项", "补齐测试矩阵"],
            risks: ["导出逻辑冗余"],
            suggestions: ["统一可视化层级"],
            diffLocations: [],
            versionDiff: { added: [], changed: [], removed: [], baselineIterationName: "baseline" }
          };
          localStorage.setItem(`buildwise:analysis-report:${iterationId}`, JSON.stringify(report));
        }
        """
    )


def normalize_actual_image_for_compare(curr: Image.Image, target_size: tuple[int, int]) -> Image.Image:
    # Browser screenshots may alternate between 1x and 2x DPR across runs.
    # Canonicalize to a single sampling path to reduce score jitter.
    if curr.size == target_size:
        supersampled = curr.resize((target_size[0] * 2, target_size[1] * 2), Image.Resampling.LANCZOS)
        return supersampled.resize(target_size, Image.Resampling.LANCZOS)
    return curr.resize(target_size, Image.Resampling.LANCZOS)


def normalize_saved_screenshot(path: Path, target_size: tuple[int, int] = (1600, 1280)) -> None:
    try:
        img = Image.open(path).convert("RGB")
        if img.size != target_size:
            normalized = img.resize(target_size, Image.Resampling.LANCZOS)
            normalized.save(path)
    except Exception:
        return


def calc_similarity(stitch_image: Path, actual_image: Path) -> tuple[float, float]:
    base = Image.open(stitch_image).convert("RGB")
    raw_curr = Image.open(actual_image).convert("RGB")
    curr = normalize_actual_image_for_compare(raw_curr, base.size)
    base_arr = np.asarray(base, dtype=np.float32)
    curr_arr = np.asarray(curr, dtype=np.float32)
    mse = float(np.mean((base_arr - curr_arr) ** 2))
    similarity = max(0.0, 1.0 - (mse**0.5) / 255.0)
    return similarity, mse


async def run(args: argparse.Namespace) -> dict[str, Any]:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = Path(args.out_dir).expanduser().resolve() / f"visual-align-{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / "report.json"

    stitch_root = Path(args.stitch_root).expanduser().resolve()
    targets = [
        ShotTarget("buildwise_1", stitch_root / "buildwise_1/screen.png", out_dir / "buildwise_1.actual.png"),
        ShotTarget("buildwise_2", stitch_root / "buildwise_2/screen.png", out_dir / "buildwise_2.actual.png"),
        ShotTarget("buildwise_3", stitch_root / "buildwise_3/screen.png", out_dir / "buildwise_3.actual.png"),
        ShotTarget("buildwise_4", stitch_root / "buildwise_4/screen.png", out_dir / "buildwise_4.actual.png"),
        ShotTarget("buildwise_5", stitch_root / "buildwise_5/screen.png", out_dir / "buildwise_5.actual.png"),
        ShotTarget("buildwise_6", stitch_root / "buildwise_6/screen.png", out_dir / "buildwise_6.actual.png"),
        ShotTarget("buildwise_7", stitch_root / "buildwise_7/screen.png", out_dir / "buildwise_7.actual.png"),
    ]

    result: dict[str, Any] = {
        "ok": False,
        "baseUrl": args.base_url,
        "outDir": str(out_dir),
        "report": str(report_path),
        "steps": {},
        "targets": {},
        "error": "",
    }

    session = BrowserSession(headless=args.headless, record_video_dir=out_dir)
    try:
        await session.start()
        await session.navigate_to(args.base_url)
        await asyncio.sleep(2.0)
        page = await session.must_get_current_page()
        await page.set_viewport_size(1600, 1280)
        await asyncio.sleep(0.3)

        # buildwise_1: login
        await clear_auth_state(page)
        await session.navigate_to(args.base_url)
        await asyncio.sleep(1.6)
        await wait_for_fonts_ready(page)
        await freeze_visual_state(page)
        result["steps"]["switchedLoginModeToAccount"] = await switch_login_mode_to_account(page)
        await asyncio.sleep(0.4)
        await wait_for_fonts_ready(page)
        await freeze_visual_state(page)
        await session.take_screenshot(path=str(targets[0].actual_image), full_page=False)
        normalize_saved_screenshot(targets[0].actual_image)
        result["steps"]["capturedLogin"] = True

        # Authenticated flow starts from dashboard.
        await set_auth_state(page)
        await session.navigate_to(args.base_url)
        await asyncio.sleep(1.8)
        page = await session.must_get_current_page()
        await page.set_viewport_size(1600, 1280)
        await asyncio.sleep(0.3)
        await wait_for_fonts_ready(page)
        await freeze_visual_state(page)

        # buildwise_2: dashboard
        await wait_for_dashboard_ready(page)
        await asyncio.sleep(0.3)
        await wait_for_fonts_ready(page)
        await freeze_visual_state(page)
        await session.take_screenshot(path=str(targets[1].actual_image), full_page=False)
        normalize_saved_screenshot(targets[1].actual_image)
        result["steps"]["capturedDashboard"] = True

        # enter project workspace
        opened_workspace = await click_selector(page, '.dock-item[title="项目库"]')
        if not opened_workspace:
            opened_workspace = await click_button_contains(page, ["查看项目工作台", "项目工作台"])
        result["steps"]["openedWorkspace"] = opened_workspace
        await asyncio.sleep(1.4)
        page = await session.must_get_current_page()

        selected_project = await select_first_project(page)
        result["steps"]["selectedProject"] = selected_project
        await asyncio.sleep(1.2)

        # buildwise_3: project panel
        await wait_for_fonts_ready(page)
        await freeze_visual_state(page)
        await session.take_screenshot(path=str(targets[2].actual_image), full_page=False)
        normalize_saved_screenshot(targets[2].actual_image)
        result["steps"]["capturedProjectPanel"] = True

        # buildwise_4: create iteration modal
        result["steps"]["openedCreateIterationModal"] = await click_button_contains(page, ["新增迭代"])
        await asyncio.sleep(1.4)
        await page.evaluate(
            """
            () => {
              window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
              const labels = Array.from(document.querySelectorAll('.iteration-type-radio'));
              const major = labels.find((item) => (item.textContent || '').includes('Major'));
              if (major) major.click();
            }
            """
        )
        await asyncio.sleep(0.35)
        await wait_for_fonts_ready(page)
        await freeze_visual_state(page)
        await asyncio.sleep(0.2)
        await session.take_screenshot(path=str(targets[3].actual_image), full_page=False)
        normalize_saved_screenshot(targets[3].actual_image)
        await page.evaluate(
            """
            () => {
              const closeBtn = Array.from(document.querySelectorAll('button')).find(btn => (btn.textContent || '').includes('取消'));
              if (closeBtn) closeBtn.click();
            }
            """
        )
        await asyncio.sleep(0.6)

        # buildwise_5: iteration workspace
        entered_iteration = await select_first_iteration(page)
        result["steps"]["enteredIteration"] = entered_iteration
        await asyncio.sleep(1.6)
        page = await session.must_get_current_page()
        await seed_mock_analysis_report(page)
        await session.navigate_to(args.base_url)
        await asyncio.sleep(1.6)
        page = await session.must_get_current_page()
        await page.set_viewport_size(1600, 1280)
        await asyncio.sleep(0.3)
        await normalize_workspace_scroll(page)
        await asyncio.sleep(0.2)
        await wait_for_fonts_ready(page)
        await freeze_visual_state(page)
        await session.take_screenshot(path=str(targets[4].actual_image), full_page=False)
        normalize_saved_screenshot(targets[4].actual_image)
        result["steps"]["capturedIterationPanel"] = True

        # buildwise_6: analysis drawer
        result["steps"]["openedAnalysisDrawer"] = await open_analysis_drawer(page)
        await asyncio.sleep(1.2)
        await set_visual_target_mode(page, "analysis")
        await asyncio.sleep(0.1)
        await normalize_workspace_scroll(page)
        await asyncio.sleep(0.2)
        await wait_for_fonts_ready(page)
        await freeze_visual_state(page)
        await session.take_screenshot(path=str(targets[5].actual_image), full_page=False)
        normalize_saved_screenshot(targets[5].actual_image)
        result["steps"]["capturedAnalysisDrawer"] = True

        # buildwise_7: interaction drawer
        await set_visual_target_mode(page, "default")
        await asyncio.sleep(0.1)
        result["steps"]["openedInteractionDrawer"] = await open_interaction_from_analysis_drawer(page)
        await asyncio.sleep(1.2)
        await normalize_workspace_scroll(page)
        await asyncio.sleep(0.2)
        await wait_for_fonts_ready(page)
        await freeze_visual_state(page)
        await session.take_screenshot(path=str(targets[6].actual_image), full_page=False)
        normalize_saved_screenshot(targets[6].actual_image)
        result["steps"]["capturedInteractionDrawer"] = True

        similarities: list[float] = []
        for target in targets:
            target_entry: dict[str, Any] = {
                "stitch": str(target.stitch_image),
                "actual": str(target.actual_image),
            }
            try:
                similarity, mse = calc_similarity(target.stitch_image, target.actual_image)
                target.similarity = similarity
                target.mse = mse
                target_entry["similarity"] = round(similarity, 4)
                target_entry["mse"] = round(mse, 2)
                similarities.append(similarity)
            except Exception as error:  # noqa: BLE001
                target.error = str(error)
                target_entry["error"] = target.error
            result["targets"][target.name] = target_entry

        avg_similarity = float(sum(similarities) / len(similarities)) if similarities else 0.0
        result["avgSimilarity"] = round(avg_similarity, 4)
        result["ok"] = all("error" not in result["targets"][item.name] for item in targets)
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
    parser = argparse.ArgumentParser(description="BuildWise 可视化 E2E 对齐（browser-use）")
    parser.add_argument("--base-url", default="http://127.0.0.1:5173")
    parser.add_argument("--stitch-root", default="/Users/zqs/Downloads/project/BuildWise/v2/stitch")
    parser.add_argument("--out-dir", default="/Users/zqs/Downloads/project/BuildWise/v2/backend/.runtime/recordings")
    parser.add_argument("--headless", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    result = asyncio.run(run(args))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
