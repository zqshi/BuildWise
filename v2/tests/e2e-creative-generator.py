"""
BuildWise E2E: "创意生成器" 全功能端到端验证
使用 browser-use 以真实用户视角完成完整迭代流程

验证环节:
1. 登录 → 仪表盘
2. 创建项目 "创意生成器"
3. 创建迭代 V1.0
4. Coach 对话（真实 LLM）— 需求澄清 + 领域建模
5. 触发分析 → 查看交付物
6. 确认分析结果
7. 继续对话推进迭代
8. 验证项目知识库构建
"""

import asyncio
import json
import os
import signal
import subprocess
import sys
import time
import httpx
from pathlib import Path
from datetime import datetime

# ── browser-use 导入 ──
sys.path.insert(0, "/Users/zqs/Downloads/project/browser-use")
from dotenv import load_dotenv

load_dotenv("/Users/zqs/Downloads/project/browser-use/.env")

from browser_use import Agent, BrowserSession, BrowserProfile
from browser_use.llm.deepseek.chat import ChatDeepSeek

# ── 配置 ──
BACKEND_DIR = Path("/Users/zqs/Downloads/project/BuildWise/v2/backend")
FRONTEND_DIR = Path("/Users/zqs/Downloads/project/BuildWise/v2")
BACKEND_PORT = 5055
FRONTEND_PORT = 5173
BACKEND_URL = f"http://127.0.0.1:{BACKEND_PORT}"
FRONTEND_URL = f"http://localhost:{FRONTEND_PORT}"
TEST_PHONE = "13800138000"

# ── 服务管理 ──
processes = []


def start_backend():
    """启动后端服务"""
    env = os.environ.copy()
    env["PORT"] = str(BACKEND_PORT)
    env["HOST"] = "127.0.0.1"
    proc = subprocess.Popen(
        ["npx", "tsx", "src/index.ts"],
        cwd=str(BACKEND_DIR),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    processes.append(proc)
    print(f"[E2E] 后端启动中 PID={proc.pid}...")
    return proc


def start_frontend():
    """启动前端 dev server"""
    proc = subprocess.Popen(
        ["npx", "vite", "--port", str(FRONTEND_PORT), "--host", "localhost"],
        cwd=str(FRONTEND_DIR),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    processes.append(proc)
    print(f"[E2E] 前端启动中 PID={proc.pid}...")
    return proc


def wait_for_service(url, path="/health", timeout=60):
    """等待服务就绪"""
    import urllib.request
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = opener.open(f"{url}{path}", timeout=5)
            if req.status == 200:
                print(f"[E2E] 服务就绪: {url}{path}")
                return True
        except Exception:
            pass
        time.sleep(1)
    raise TimeoutError(f"服务未就绪: {url}{path}")


def wait_for_frontend(timeout=60):
    """等待前端 dev server 就绪"""
    import urllib.request
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = opener.open(f"{FRONTEND_URL}/", timeout=5)
            if req.status == 200:
                print(f"[E2E] 前端就绪: {FRONTEND_URL}")
                return True
        except Exception:
            pass
        time.sleep(1)
    raise TimeoutError(f"前端未就绪: {FRONTEND_URL}")


def seed_test_user():
    """通过治理 API 预置测试用户（需 AUTH_MODE 兼容）"""
    # 先用环境变量的 token 模式 API 或直接写入
    # 由于后端启动时 data.runtime.json 为空，用 API 创建
    r = httpx.post(
        f"{BACKEND_URL}/api/v1/governance/platform-role-bindings",
        json={"userId": TEST_PHONE, "role": "owner"},
        headers={"Authorization": "Bearer owner"},
        timeout=10,
    )
    if r.status_code == 200:
        print(f"[E2E] 测试用户已预置: {TEST_PHONE} (owner)")
    else:
        print(f"[E2E] 预置用户失败: {r.status_code} {r.text}")
        # JWT 模式下可能需要其他方式，尝试直接写文件
        seed_test_user_via_file()


def seed_test_user_via_file():
    """直接在 data.runtime.json 中注入测试用户"""
    data_file = BACKEND_DIR / "data.runtime.json"
    if data_file.exists():
        with open(data_file, "r") as f:
            data = json.load(f)
    else:
        data = {}

    bindings = data.get("platformRoleBindings", [])
    if not any(b.get("userId") == TEST_PHONE for b in bindings):
        bindings.append({
            "id": 1,
            "userId": TEST_PHONE,
            "role": "owner",
            "createdAt": datetime.now().isoformat(),
            "updatedAt": datetime.now().isoformat(),
        })
        data["platformRoleBindings"] = bindings
        with open(data_file, "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"[E2E] 测试用户已通过文件注入: {TEST_PHONE}")


def cleanup():
    """清理所有子进程"""
    for proc in processes:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except Exception:
            proc.kill()
    print("[E2E] 所有服务已停止")


# ── E2E 测试任务 ──

TASK_LOGIN = f"""
你是一个 QA 测试工程师，正在测试 BuildWise 平台。请严格按步骤操作：

第一步：登录
1. 当前页面应该是登录页面，包含手机号输入框
2. 确保当前是"手机验证码"模式（默认就是）
3. 在手机号输入框（id="loginPhone"）中输入: {TEST_PHONE}
4. 点击"发送验证码"按钮
5. 等待页面上出现验证码提示（开发环境会自动显示 debugCode），验证码会自动填入验证码输入框
6. 点击"登录"按钮提交表单
7. 等待页面跳转到仪表盘（dashboard），确认看到仪表盘页面

完成后报告：登录是否成功，仪表盘上能看到什么内容。
"""

TASK_CREATE_PROJECT = """
第二步：创建项目

1. 点击左侧导航栏中的"项目"图标（第二个图标）切换到项目视图
2. 如果看到空状态页面，点击"立即创建项目"按钮；如果已有项目列表，点击"新建项目"按钮
3. 在弹出的创建项目弹窗中：
   - 项目名称输入: 创意生成器
   - 项目描述输入: 一个基于AI的创意内容生成平台，支持多种创意类型（文案、图片描述、营销策略），帮助营销团队快速产出高质量创意内容。核心功能包括：创意模板管理、AI智能生成、创意评分与优化、团队协作审批。
4. 点击"创建项目"按钮提交
5. 等待项目创建成功，确认项目出现在列表中

完成后报告：项目是否创建成功，项目概览面板显示了什么信息。
"""

TASK_CREATE_ITERATION = """
第三步：创建迭代

1. 在当前项目概览面板中，找到并点击"新增迭代"按钮
2. 在弹出的创建迭代弹窗中：
   - 迭代名称输入: V1.0 核心功能迭代
   - 版本类型选择: major（第一个选项）
   - 目标描述输入: 完成创意生成器的核心功能闭环：用户可以选择创意类型、输入关键信息、AI生成创意内容、对创意进行评分和优化。本迭代聚焦单用户使用场景，暂不涉及团队协作功能。
   - 范围内功能输入: 创意模板CRUD、AI创意生成接口、创意评分算法、创意历史管理、基础用户界面
   - 范围外说明输入: 团队协作审批流程、多语言支持、第三方平台集成、高级数据分析
3. 点击"确认创建"按钮提交
4. 等待迭代创建成功
5. 在版本列表中找到新建的迭代，点击"进入版本"按钮进入迭代工作台

完成后报告：迭代是否创建成功，进入工作台后看到了什么界面。
"""

TASK_COACH_DIALOGUE = """
第四步：与 Coach 进行需求澄清对话

你现在应该在迭代工作台中，可以看到一个聊天对话界面。请进行以下对话：

1. 在底部的消息输入框中输入以下内容，然后发送（点击发送按钮或按回车）：
   "我想做一个创意生成器产品，主要面向营销团队。用户输入一些关键信息（比如产品名称、目标受众、营销渠道），AI就能生成对应的创意文案。你觉得这个产品的核心领域模型应该怎么设计？有哪些关键实体和业务规则？"

2. 等待 AI Coach 回复（可能需要几秒到几十秒），仔细阅读回复内容

3. 继续发送第二条消息：
   "很好，那我们先聚焦在创意模板管理和AI生成这两个核心模块。创意模板应该包含哪些字段？生成流程的状态机应该怎么设计？另外，创意评分的规则是什么？"

4. 等待 AI Coach 回复

5. 发送第三条消息触发边界确认：
   "我确认以上分析内容，请帮我整理成正式的分析报告。本迭代范围确认为：创意模板管理、AI创意生成、创意评分三个核心模块。"

6. 等待 AI Coach 回复

完成后报告：
- Coach 的每一轮回复的核心内容摘要
- 是否涉及了领域建模的讨论（实体、规则、关系）
- 页面上是否出现了交付物卡片或分析报告相关内容
- 对话的整体质量评价
"""

TASK_VERIFY_DELIVERABLES = """
第五步：验证交付物和项目状态

1. 观察当前页面，检查以下内容：
   - 对话区域是否有交付物卡片（artifact card）出现？如果有，点击查看内容
   - 页面右侧或下方是否有交付物面板？如果有，查看里面的内容
   - 是否能看到分析报告、领域模型、或其他结构化交付物？

2. 点击左侧导航回到项目视图，检查项目概览面板：
   - 项目健康分数是否有变化？
   - 是否能看到领域模型图或知识库信息？
   - 迭代状态是否有更新？

3. 再次点击进入迭代，查看完整的对话历史和交付物状态

完成后报告一份完整的验证结果：
- 项目创建: 成功/失败
- 迭代创建: 成功/失败
- Coach 对话: 正常/异常（是否有真实 LLM 回复）
- 领域建模: 是否讨论了实体、规则、关系
- 交付物: 是否生成了可见的交付物
- 知识库: 项目概览中是否有知识积累的迹象
- 整体评价: 一句话总结
"""


async def run_e2e():
    """主测试流程"""
    print("=" * 60)
    print(f"[E2E] BuildWise 创意生成器 端到端测试")
    print(f"[E2E] 开始时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # ── 1. 检查服务 ──
    print("\n[E2E] === 检查服务状态 ===")
    wait_for_service(BACKEND_URL, "/health", timeout=5)
    wait_for_frontend(timeout=5)

    # ── 3. 初始化 browser-use ──
    print("\n[E2E] === 初始化浏览器 ===")
    browser = BrowserSession(
        browser_profile=BrowserProfile(
            headless=False,  # 可视化展示
            keep_alive=True,
        )
    )

    llm = ChatDeepSeek(
        model="deepseek-chat",
        api_key="sk-e583b61015a94e57956da61821c9d300",
        base_url="https://api.deepseek.com/v1",
    )

    results = {}

    # ── 4. 分阶段执行测试 ──
    stages = [
        ("登录", TASK_LOGIN, f"{FRONTEND_URL}/#/login"),
        ("创建项目", TASK_CREATE_PROJECT, None),
        ("创建迭代", TASK_CREATE_ITERATION, None),
        ("Coach对话", TASK_COACH_DIALOGUE, None),
        ("验证交付物", TASK_VERIFY_DELIVERABLES, None),
    ]

    for stage_name, task, initial_url in stages:
        print(f"\n[E2E] === 阶段: {stage_name} ===")

        initial_actions = []
        if initial_url:
            initial_actions = [{"navigate": {"url": initial_url}}]

        agent = Agent(
            task=task,
            llm=llm,
            browser_session=browser,
            initial_actions=initial_actions if initial_actions else None,
            use_vision="auto",
            max_failures=3,
        )

        try:
            history = await agent.run(max_steps=25)
            result_text = history.final_result() or "无输出"
            is_success = history.is_successful()
            results[stage_name] = {
                "passed": is_success,
                "output": result_text,
                "steps": len(history.action_results()) if hasattr(history, 'action_results') else 0,
            }
            print(f"[E2E] {stage_name}: {'PASS' if is_success else 'FAIL'}")
            print(f"[E2E] 输出: {result_text[:500]}")
        except Exception as e:
            results[stage_name] = {
                "passed": False,
                "output": str(e),
                "steps": 0,
            }
            print(f"[E2E] {stage_name}: ERROR - {e}")

    # ── 5. 生成报告 ──
    print("\n" + "=" * 60)
    print("[E2E] === 测试报告 ===")
    print("=" * 60)

    all_passed = all(r["passed"] for r in results.values())

    for name, result in results.items():
        status = "PASS" if result["passed"] else "FAIL"
        print(f"  [{status}] {name}")
        print(f"         输出: {result['output'][:200]}")
        print()

    print(f"总结: {'全部通过' if all_passed else '存在失败'}")
    print(f"结束时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    # 保存报告
    report_path = FRONTEND_DIR / f"e2e_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "scenario": "创意生成器",
            "allPassed": all_passed,
            "results": results,
        }, f, ensure_ascii=False, indent=2)
    print(f"\n[E2E] 报告已保存: {report_path}")

    # ── 6. 清理浏览器 ──
    await browser.kill()


if __name__ == "__main__":
    try:
        asyncio.run(run_e2e())
    except KeyboardInterrupt:
        print("\n[E2E] 用户中断")
        cleanup()
