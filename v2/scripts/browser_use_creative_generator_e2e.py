#!/usr/bin/env python3
"""browser-use agent E2E for the BuildWise creative generator demo."""

import asyncio
import json
import os
import tempfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from browser_use import Agent, BrowserSession
from browser_use.browser.profile import BrowserProfile
from browser_use.llm import ChatAnthropic, ChatDeepSeek, ChatOpenAI

WORKDIR = Path('/Users/zqs/Downloads/project/BuildWise/v2')
ARTIFACTS_DIR = WORKDIR / '.artifacts'
LATEST_SETUP = ARTIFACTS_DIR / 'creative-generator-demo-latest.json'
REPORT_STAMP = datetime.now().strftime('%Y%m%d_%H%M%S')
REPORT_PATH = ARTIFACTS_DIR / f'browser-use-creative-generator-e2e-{REPORT_STAMP}.json'
TARGET_URL = 'http://127.0.0.1:5173/app.html#/dashboard'
LOGIN_PHONE = '13800138000'
BACKEND_ENV_PATH = WORKDIR / 'backend/.env'
HEADLESS = (os.getenv('BROWSER_USE_HEADLESS', '0').strip() not in {'0', 'false', 'False'})
BROWSER_USE_PROVIDER = os.getenv('BROWSER_USE_PROVIDER', 'anthropic').strip().lower()

SYSTEM_RULE = (
    'You are controlling browser-use tools. Always output valid browser-use action schema only. '
    'Use one action at a time unless strictly necessary. Never invent top-level keys like clear/index/text/click/input. '
    'Use the browser-use action wrapper exactly as required by the tool schema.'
)


@dataclass
class StageResult:
    key: str
    ok: bool
    note: str
    raw_output: str


def load_setup_payload() -> dict:
    if not LATEST_SETUP.exists():
        raise FileNotFoundError(f'missing setup payload: {LATEST_SETUP}')
    return json.loads(LATEST_SETUP.read_text(encoding='utf-8'))


def load_backend_env() -> dict:
    values: dict[str, str] = {}
    if not BACKEND_ENV_PATH.exists():
        return values
    for line in BACKEND_ENV_PATH.read_text(encoding='utf-8').splitlines():
        text = line.strip()
        if not text or text.startswith('#') or '=' not in text:
            continue
        key, value = text.split('=', 1)
        values[key.strip()] = value.strip()
    return values


def build_llm(backend_env: dict):
    if BROWSER_USE_PROVIDER == 'deepseek':
        api_key = (os.getenv('DEEPSEEK_API_KEY') or os.getenv('OPENAI_API_KEY') or '').strip()
        base_url = (os.getenv('DEEPSEEK_BASE_URL') or os.getenv('OPENAI_API_BASE') or 'https://api.deepseek.com/v1').strip()
        model = (os.getenv('DEEPSEEK_MODEL') or os.getenv('OPENAI_MODEL') or 'deepseek-chat').strip()
        if not api_key:
            raise RuntimeError('DEEPSEEK_API_KEY is required for deepseek mode')
        return ChatDeepSeek(model=model, api_key=api_key, base_url=base_url, max_tokens=4096)

    if BROWSER_USE_PROVIDER == 'openai-compatible':
        api_key = (os.getenv('OPENAI_API_KEY') or backend_env.get('OPENAI_API_KEY') or os.getenv('DEEPSEEK_API_KEY') or '').strip()
        base_url = (os.getenv('OPENAI_BASE_URL') or backend_env.get('OPENAI_BASE_URL') or os.getenv('DEEPSEEK_BASE_URL') or '').strip()
        model = (os.getenv('OPENAI_MODEL') or backend_env.get('OPENAI_MODEL') or os.getenv('DEEPSEEK_MODEL') or 'deepseek-chat').strip()
        if not api_key or not base_url:
            raise RuntimeError('OPENAI_API_KEY / OPENAI_BASE_URL is required for openai-compatible mode')
        return ChatOpenAI(model=model, api_key=api_key, base_url=base_url, max_completion_tokens=4096)

    prefer_minimax = BROWSER_USE_PROVIDER == 'minimax'
    auth_token = (
        (
            (os.getenv('MINIMAX_API_KEY') if prefer_minimax else None)
            or (backend_env.get('MINIMAX_API_KEY') if prefer_minimax else None)
            or os.getenv('ANTHROPIC_AUTH_TOKEN')
            or backend_env.get('ANTHROPIC_AUTH_TOKEN')
            or os.getenv('MINIMAX_API_KEY')
            or backend_env.get('MINIMAX_API_KEY')
            or ''
        )
    ).strip()
    base_url = (
        (
            (os.getenv('MINIMAX_API_BASE') if prefer_minimax else None)
            or (backend_env.get('MINIMAX_API_BASE') if prefer_minimax else None)
            or os.getenv('ANTHROPIC_BASE_URL')
            or backend_env.get('ANTHROPIC_BASE_URL')
            or os.getenv('MINIMAX_API_BASE')
            or backend_env.get('MINIMAX_API_BASE')
            or ''
        )
    ).strip()
    model = (
        (
            (os.getenv('MINIMAX_MODEL') if prefer_minimax else None)
            or (backend_env.get('MINIMAX_MODEL') if prefer_minimax else None)
            or os.getenv('ANTHROPIC_MODEL')
            or backend_env.get('ANTHROPIC_MODEL')
            or os.getenv('MINIMAX_MODEL')
            or backend_env.get('MINIMAX_MODEL')
            or 'MiniMax-M2.5'
        )
    ).strip()
    if not auth_token or not base_url:
        raise RuntimeError('ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL is required')
    return ChatAnthropic(model=model, auth_token=auth_token, base_url=base_url, max_tokens=4096)


def build_fallback_llm():
    api_key = (os.getenv('DEEPSEEK_API_KEY') or '').strip()
    if not api_key:
        return None
    base_url = (os.getenv('DEEPSEEK_BASE_URL') or 'https://api.deepseek.com/v1').strip()
    model = (os.getenv('DEEPSEEK_MODEL') or 'deepseek-chat').strip()
    return ChatDeepSeek(model=model, api_key=api_key, base_url=base_url, max_tokens=4096)


def build_stages(payload: dict) -> list[tuple[str, str]]:
    project_name = payload['project']['name']
    iterations = payload.get('iterations') or ([payload['iteration']] if payload.get('iteration') else [])
    v1 = next((item for item in iterations if str(item.get('version', '')).startswith('1.0')), iterations[0] if iterations else {})
    v11 = next((item for item in iterations if str(item.get('version', '')).startswith('1.1')), iterations[-1] if iterations else {})
    v1_name = v1.get('name', 'V1 首版本：创意生成器 MVP')
    v11_name = v11.get('name', 'V1.1 后续版本：业务规则注入与历史筛选')
    return [
        (
            'login',
            f'''先打开 http://127.0.0.1:5173/app.html#/login。
如果看到登录页：无论“手机验证码”是否已经选中，都先点击一次“手机验证码”标签，再输入手机号 {LOGIN_PHONE}，点击“发送验证码”，等待验证码自动填入后点击“登 录”。
如果已经是已登录态，也需要确认当前不在营销页。
            完成后只输出一行：PASS - 说明 或 FAIL - 说明。''',
        ),
        (
            'workspace_navigation',
            f'''在当前浏览器会话中继续操作。
先在仪表盘中定位项目“{project_name}”，优先点击该项目区域附近的“查看全部”按钮展开项目版本面板。
然后在版本列表中找到“{v11_name}”对应的“进入版本”按钮并点击。
成功标准：页面显示“迭代内需求沟通”，且顶部能看到“{v11_name}”或其版本号，且会话区能看到 BuildWise AI 消息。
            完成后只输出一行：PASS - 说明 或 FAIL - 说明。''',
        ),
        (
            'change_mapping_toggle',
            '''保持在当前 V1.1 的“迭代内需求沟通”页面，不要点击“返回项目管理”或离开当前页面。
不要再查找“查看变更映射”按钮；顶部状态条不应再出现这个入口。
顶部不应再出现常驻的变更影响提醒卡；影响评估应直接体现在会话消息里，而不是单独占用固定显示区域。
如果页面里不存在“查看变更映射”按钮，且顶部没有额外常驻提醒卡，即判定通过。
            完成后只输出一行：PASS - 说明 或 FAIL - 说明。''',
        ),
        (
            'v11_analysis_drawer',
            '''在会话流中找到“继承差异分析报告”交付物卡片，点击“查看交付物”。
            确认右侧抽屉出现，并且正文不是空白提示。
            完成后只输出一行：PASS - 说明 或 FAIL - 说明。''',
        ),
        (
            'drawer_to_chat',
            '''在任一已打开的交付物抽屉中，点击“去对话中提调整”。
确认抽屉自动滑出关闭，不需要再点右上角 X；同时主输入框已自动带入调整文本且获得焦点。
            完成后只输出一行：PASS - 说明 或 FAIL - 说明。''',
        ),
        (
            'chat_followup_v11',
            '''在当前 V1.1 页面主输入框继续发送一句：“请继续推进创意生成器 V1.1，并明确业务规则如何映射到工程对象。”
确认页面出现新的 AI 回复。
            完成后只输出一行：PASS - 说明 或 FAIL - 说明。''',
        ),
        (
            'switch_to_v1',
            f'''回到版本选择或项目页，切换进入版本“{v1_name}”。
成功标准：页面顶部出现“{v1_name}”或版本号 1.0.0，并能看到首版交付物会话卡片。
            完成后只输出一行：PASS - 说明 或 FAIL - 说明。''',
        ),
        (
            'v1_analysis_drawer',
            '''在 V1 会话流中找到“首版需求分析报告”交付物卡片，点击“查看交付物”。
确认抽屉出现，正文含有分析报告结构化内容，而不是空摘要。
            完成后只输出一行：PASS - 说明 或 FAIL - 说明。''',
        ),
        (
            'prd_readonly_edit',
            '''在 V1 会话流中找到“产品需求文档”交付物卡片，点击“查看交付物”。
确认抽屉默认是只读状态；点击“编辑”进入编辑态，再点击“结束编辑”退出。
            完成后只输出一行：PASS - 说明 或 FAIL - 说明。''',
        ),
        (
            'markdown_render',
            '''仍在“产品需求文档”抽屉内，确认正文是 Markdown 渲染后的标题/列表，而不是整段原始 markdown 文本。
完成后只输出一行：PASS - 说明 或 FAIL - 说明。''',
        ),
        (
            'code_viewer',
            '''在 V1 会话流中找到“代码交付”交付物卡片，点击“查看交付物”。
确认看到代码编辑器视图、代码行号或代码块，而不是普通摘要段落。
完成后只输出一行：PASS - 说明 或 FAIL - 说明。''',
        ),
        (
            'prototype_selection',
            '''在 V1 会话流中找到“原型与交互”交付物卡片，点击“查看交付物”。
点击“选择元素”，确认按钮状态切换为“退出选中”或等价反馈，证明点击有效。
完成后只输出一行：PASS - 说明 或 FAIL - 说明。''',
        ),
        (
            'artifact_confirmation',
            '''在任一待确认交付物抽屉中，检查存在“提交确认”或“确认通过”动作。
执行一次安全的确认动作，并确认页面有成功反馈，不允许点击无反应。
完成后只输出一行：PASS - 说明 或 FAIL - 说明。''',
        ),
        (
            'chat_followup_v1',
            '回到主对话输入框，发送一句：“请继续推进创意生成器下一步，并保持交付物先确认再进入后续环节。”\n'
            '确认页面出现新的 AI 回复。\n完成后只输出一行：PASS - 说明 或 FAIL - 说明。',
        ),
    ]


async def run_stage(session: BrowserSession, llm, key: str, task: str) -> StageResult:
    async def execute_stage(stage_llm, *, use_vision: bool, suffix: str):
        agent = Agent(
            task=task,
            llm=stage_llm,
            browser_session=session,
            use_vision=use_vision,
            use_thinking=False,
            max_actions_per_step=1,
            include_tool_call_examples=True,
            save_conversation_path=str(ARTIFACTS_DIR / f'browser-use-{key}-{suffix}-{REPORT_STAMP}.json'),
            extend_system_message=SYSTEM_RULE,
            max_failures=6,
            step_timeout=180,
        )
        history = await agent.run(max_steps=40)
        return (history.final_result() or '').strip()

    fallback_llm = build_fallback_llm()
    prefer_dom_only = BROWSER_USE_PROVIDER == 'deepseek'
    try:
        raw = await execute_stage(llm, use_vision=not prefer_dom_only, suffix='vision' if not prefer_dom_only else 'dom-primary')
    except Exception as exc:
        raw = f'FAIL - browser-use stage exception: {exc}'
    line = next((item.strip() for item in raw.splitlines() if item.strip()), 'FAIL - no output')
    ok = line.upper().startswith('PASS')
    if not ok and fallback_llm is not None:
        try:
            raw = await execute_stage(fallback_llm, use_vision=False, suffix='dom-fallback')
        except Exception as exc:
            raw = f'FAIL - browser-use dom fallback exception: {exc}'
    line = next((item.strip() for item in raw.splitlines() if item.strip()), 'FAIL - no output')
    ok = line.upper().startswith('PASS')
    return StageResult(key=key, ok=ok, note=line, raw_output=raw)


async def main() -> int:
    payload = load_setup_payload()
    backend_env = load_backend_env()
    llm = build_llm(backend_env)
    fresh_profile_dir = tempfile.mkdtemp(prefix='buildwise-browser-use-')
    session = BrowserSession(
        browser_profile=BrowserProfile(
            headless=HEADLESS,
            window_size={'width': 1600, 'height': 1100},
            user_data_dir=fresh_profile_dir,
        ),
        allowed_domains=['127.0.0.1', 'localhost'],
        headless=HEADLESS,
        keep_alive=True,
        wait_between_actions=0.8,
        minimum_wait_page_load_time=1.0,
        wait_for_network_idle_page_load_time=1.0,
    )

    results: list[StageResult] = []
    try:
        for key, task in build_stages(payload):
            result = await run_stage(session, llm, key, task)
            results.append(result)
            if not result.ok:
                break
    finally:
        try:
            await session.stop()
        except Exception:
            pass

    raw_report_lines = ['---TEST REPORT---']
    for key in [
        'login',
        'workspace_navigation',
        'change_mapping_toggle',
        'v11_analysis_drawer',
        'drawer_to_chat',
        'chat_followup_v11',
        'switch_to_v1',
        'v1_analysis_drawer',
        'prd_readonly_edit',
        'markdown_render',
        'code_viewer',
        'prototype_selection',
        'artifact_confirmation',
        'chat_followup_v1',
    ]:
        found = next((item for item in results if item.key == key), None)
        if found:
            status = 'PASS' if found.ok else 'FAIL'
            note = found.note.split(' - ', 1)[1] if ' - ' in found.note else found.note
            raw_report_lines.append(f'{key}: {status} - {note}')
        else:
            raw_report_lines.append(f'{key}: FAIL - 未执行到该阶段')
    raw_report_lines.append('---END REPORT---')
    final_report = '\n'.join(raw_report_lines)
    REPORT_PATH.write_text(
        json.dumps(
            {
                'timestamp': datetime.now().isoformat(),
                'target': TARGET_URL,
                'project': payload['project'],
                'iterations': payload.get('iterations') or ([payload['iteration']] if payload.get('iteration') else []),
                'results': [item.__dict__ for item in results],
                'final_report': final_report,
            },
            ensure_ascii=False,
            indent=2,
        ) + '\n',
        encoding='utf-8',
    )
    print(final_report)
    print(f'\nreport_saved={REPORT_PATH}')
    return 0 if all(item.ok for item in results) and len(results) == 14 else 1


if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
