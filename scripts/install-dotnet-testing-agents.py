#!/usr/bin/env python3
"""
install-dotnet-testing-agents.py

一鍵安裝 dotnet-testing Agent Orchestration 所需的全部元件到指定的目標專案。

安裝內容：
  1. .claude/agents/   — 16 個 Subagent 定義檔（直接從本 repo 複製）
  2. .claude/hooks/    — 計時 Hook 腳本（直接從本 repo 複製）
  3. .claude/skills/   — 5 個 Orchestrator Skills（直接從本 repo 複製）
  4. .claude/skills/   — 29 個 Agent Skills（從 dotnet-testing-agent-skills GitHub release 下載）
  5. .claude/settings.json — 執行 install-hooks.js 寫入 hooks 配置

用法：
  python scripts/install-dotnet-testing-agents.py                    # 目標為目前工作目錄
  python scripts/install-dotnet-testing-agents.py /path/to/project   # 指定目標專案路徑
"""

import io
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

# Windows 上強制 UTF-8 輸出，避免 CP950 / CP936 編碼錯誤
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ─── 常數 ────────────────────────────────────────────────────────────────────

AGENT_SKILLS_REPO = "kevintsengtw/dotnet-testing-agent-skills"

EXPECTED_AGENTS = 16
EXPECTED_REPO_SKILLS = 5        # 本 repo 內建的 5 個 Skill 目錄
EXPECTED_AGENT_SKILLS = 29      # 從 dotnet-testing-agent-skills 安裝的 Skills
EXPECTED_TOTAL_SKILLS = EXPECTED_REPO_SKILLS + EXPECTED_AGENT_SKILLS  # 34

# ─── 顏色輸出 ─────────────────────────────────────────────────────────────────

_COLOR = sys.stdout.isatty() and os.environ.get("TERM") != "dumb"


def _c(code: str, text: str) -> str:
    return f"\x1b[{code}m{text}\x1b[0m" if _COLOR else text


def info(msg: str) -> None:
    print(f"{_c('34', '[INFO]')} {msg}")


def ok(msg: str) -> None:
    print(f"{_c('32', '[OK]')} {msg}")


def warn(msg: str) -> None:
    print(f"{_c('33', '[WARN]')} {msg}")


def err(msg: str) -> None:
    print(f"{_c('31', '[ERROR]')} {msg}", file=sys.stderr)


def step(n: int, title: str) -> None:
    print(f"\n{_c('36', f'Step {n}:')} {title}")
    print("─" * 50)


# ─── 輔助函式 ─────────────────────────────────────────────────────────────────

def copy_dir(src: Path, dst: Path) -> int:
    """遞迴複製目錄，覆蓋已存在的檔案，回傳複製的檔案數。"""
    dst.mkdir(parents=True, exist_ok=True)
    count = 0
    for item in src.rglob("*"):
        rel = item.relative_to(src)
        target = dst / rel
        if item.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(item, target)
            count += 1
    return count


def copy_file(src: Path, dst: Path) -> None:
    """複製單一檔案，確保目標目錄存在。"""
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dst)


def fetch_latest_release_zipball(repo: str) -> str:
    """取得 GitHub 最新 release 的 zipball_url。"""
    api_url = f"https://api.github.com/repos/{repo}/releases/latest"
    req = urllib.request.Request(
        api_url,
        headers={
            "User-Agent": "dotnet-testing-installer/1.0",
            "Accept": "application/vnd.github+json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode())
    tag = data.get("tag_name", "unknown")
    zipball_url = data["zipball_url"]
    info(f"最新版本：{tag}")
    return zipball_url


def download_file(url: str, dest: Path) -> None:
    """下載檔案到指定路徑，顯示簡易進度。"""
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "dotnet-testing-installer/1.0"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        total = int(resp.headers.get("Content-Length", 0))
        downloaded = 0
        chunk_size = 8192
        with open(dest, "wb") as f:
            while True:
                chunk = resp.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    pct = downloaded * 100 // total
                    print(f"\r  下載中... {pct:3d}%", end="", flush=True)
    if total:
        print()  # newline after progress


def find_skill_dirs(extracted_root: Path) -> list:
    """找出解壓後所有包含 SKILL.md 的子目錄（即每個 Skill 的根目錄）。

    支援兩種常見的 zipball 結構：
    - 結構 A：skills 直接在 repo 根目錄下（<repo-root>/<skill-name>/SKILL.md）
    - 結構 B：skills 在 repo 根目錄的子目錄下（<repo-root>/skills/<skill-name>/SKILL.md）
    """
    top_dirs = sorted([d for d in extracted_root.iterdir() if d.is_dir()])
    if not top_dirs:
        return []
    # zipball 解壓後頂層通常只有一個 repo 目錄（如 kevintsengtw-dotnet-testing-agent-skills-abc123/）
    repo_root = top_dirs[0]

    # 結構 A：skill 目錄直接在 repo 根目錄下
    skills = [d for d in repo_root.iterdir() if d.is_dir() and (d / "SKILL.md").exists()]
    if skills:
        return skills

    # 結構 B：skill 目錄在某個子目錄（如 skills/）下
    for subdir in sorted(repo_root.iterdir()):
        if subdir.is_dir():
            nested = [d for d in subdir.iterdir() if d.is_dir() and (d / "SKILL.md").exists()]
            if nested:
                info(f"在子目錄 {subdir.name}/ 下找到 Skills")
                return nested

    return []


# ─── 安裝步驟 ─────────────────────────────────────────────────────────────────

def step1_copy_agents(source_claude: Path, target_claude: Path) -> bool:
    step(1, "複製 .claude/agents/（16 個 Subagent 定義檔）")
    src = source_claude / "agents"
    dst = target_claude / "agents"
    if not src.exists():
        err(f"來源目錄不存在：{src}")
        return False
    dst.mkdir(parents=True, exist_ok=True)
    copied = 0
    for md_file in src.glob("*.md"):
        copy_file(md_file, dst / md_file.name)
        copied += 1
    ok(f"已複製 {copied} 個 .md 檔案到 {dst}")
    return True


def step2_copy_hooks(source_claude: Path, target_claude: Path) -> bool:
    step(2, "複製 .claude/hooks/（計時 Hook 腳本）")
    src = source_claude / "hooks"
    dst = target_claude / "hooks"
    if not src.exists():
        err(f"來源目錄不存在：{src}")
        return False
    dst.mkdir(parents=True, exist_ok=True)
    copied = 0
    for f in src.iterdir():
        if f.is_file():
            copy_file(f, dst / f.name)
            copied += 1
            ok(f"  已複製：{f.name}")
    return True


def step3_copy_repo_skills(source_claude: Path, target_claude: Path) -> bool:
    step(3, "複製 .claude/skills/（本 repo 內建的 5 個 Skills）")
    src = source_claude / "skills"
    dst = target_claude / "skills"
    if not src.exists():
        err(f"來源目錄不存在：{src}")
        return False
    dst.mkdir(parents=True, exist_ok=True)
    copied_dirs = 0
    for skill_dir in src.iterdir():
        if skill_dir.is_dir() and (skill_dir / "SKILL.md").exists():
            target_skill = dst / skill_dir.name
            count = copy_dir(skill_dir, target_skill)
            ok(f"  已複製：{skill_dir.name}/ （{count} 個檔案）")
            copied_dirs += 1
    ok(f"共複製 {copied_dirs} 個 Skill 目錄")
    return True


def step4_install_agent_skills(target_claude: Path) -> bool:
    step(4, f"下載 dotnet-testing-agent-skills 最新 Release")
    skills_dst = target_claude / "skills"
    skills_dst.mkdir(parents=True, exist_ok=True)

    # 4a. 取得 release zipball URL
    try:
        info(f"查詢 GitHub release：{AGENT_SKILLS_REPO}")
        zipball_url = fetch_latest_release_zipball(AGENT_SKILLS_REPO)
    except urllib.error.HTTPError as e:
        err(f"GitHub API 請求失敗（HTTP {e.code}）：{e.reason}")
        return False
    except urllib.error.URLError as e:
        err(f"網路連線失敗：{e.reason}")
        return False

    tmp_dir = Path(tempfile.mkdtemp(prefix="dotnet-skills-"))
    zip_path = tmp_dir / "agent-skills.zip"

    try:
        # 4b. 下載 zipball
        info(f"下載中：{zipball_url}")
        download_file(zipball_url, zip_path)
        ok(f"下載完成：{zip_path.stat().st_size // 1024} KB")

        # 4c. 解壓縮
        extract_dir = tmp_dir / "extracted"
        extract_dir.mkdir()
        info("解壓縮中...")
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)

        # 4d. 找出所有 Skill 目錄
        skill_dirs = find_skill_dirs(extract_dir)
        if not skill_dirs:
            err("解壓後找不到任何包含 SKILL.md 的目錄")
            return False
        info(f"找到 {len(skill_dirs)} 個 Skill 目錄")

        # 4e. 複製到目標
        for skill_dir in skill_dirs:
            target_skill = skills_dst / skill_dir.name
            copy_dir(skill_dir, target_skill)
        ok(f"已安裝 {len(skill_dirs)} 個 Agent Skills 到 {skills_dst}")

    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

    return True


def step5_run_install_hooks(target_dir: Path) -> bool:
    step(5, "執行 install-hooks.js（寫入 .claude/settings.json）")
    hooks_js = target_dir / ".claude" / "hooks" / "install-hooks.js"
    if not hooks_js.exists():
        err(f"找不到 install-hooks.js：{hooks_js}")
        return False
    try:
        result = subprocess.run(
            ["node", str(hooks_js), str(target_dir)],
            capture_output=False,
            text=True,
            check=True,
        )
        return True
    except subprocess.CalledProcessError as e:
        err(f"install-hooks.js 執行失敗（exit {e.returncode}）")
        return False
    except FileNotFoundError:
        err("找不到 node 指令，請確認 Node.js 已安裝並在 PATH 中")
        return False


def step6_verify(target_claude: Path) -> dict:
    step(6, "環境驗證")

    results = {}

    # agents/*.md 數量
    agents_dir = target_claude / "agents"
    agent_files = list(agents_dir.glob("*.md")) if agents_dir.exists() else []
    results["agents"] = len(agent_files)
    pass_fail = _c("32", "PASS") if len(agent_files) == EXPECTED_AGENTS else _c("31", "FAIL")
    print(f"  [{pass_fail}] agents/*.md：{len(agent_files)} 個（預期 {EXPECTED_AGENTS}）")

    # hooks/ 檔案數量
    hooks_dir = target_claude / "hooks"
    hook_files = list(hooks_dir.iterdir()) if hooks_dir.exists() else []
    hook_count = len([f for f in hook_files if f.is_file()])
    results["hooks"] = hook_count
    pass_fail = _c("32", "PASS") if hook_count >= 3 else _c("31", "FAIL")
    print(f"  [{pass_fail}] hooks/ 檔案：{hook_count} 個（預期 >= 3）")

    # skills/ 目錄數量（含 SKILL.md）
    skills_dir = target_claude / "skills"
    skill_dirs = (
        [d for d in skills_dir.iterdir() if d.is_dir() and (d / "SKILL.md").exists()]
        if skills_dir.exists()
        else []
    )
    results["skills"] = len(skill_dirs)
    pass_fail = _c("32", "PASS") if len(skill_dirs) >= EXPECTED_TOTAL_SKILLS else _c("31", "FAIL")
    print(
        f"  [{pass_fail}] skills/ 目錄（含 SKILL.md）：{len(skill_dirs)} 個"
        f"（預期 >= {EXPECTED_TOTAL_SKILLS} = {EXPECTED_REPO_SKILLS} repo + {EXPECTED_AGENT_SKILLS} agent-skills）"
    )

    # settings.json 存在
    settings = target_claude / "settings.json"
    results["settings"] = settings.exists()
    pass_fail = _c("32", "PASS") if settings.exists() else _c("31", "FAIL")
    print(f"  [{pass_fail}] .claude/settings.json：{'存在' if settings.exists() else '不存在'}")

    return results


# ─── 主程式 ───────────────────────────────────────────────────────────────────

def main() -> int:
    print()
    print("╔══════════════════════════════════════════════════════╗")
    print("║  dotnet-testing Agent Orchestration 安裝程式         ║")
    print("╚══════════════════════════════════════════════════════╝")
    print()

    # 解析目標路徑
    target_dir = Path(sys.argv[1] if len(sys.argv) > 1 else os.getcwd()).resolve()
    # 指令碼位於 <repo>/scripts/install.py，source_claude 為 <repo>/.claude
    script_dir = Path(__file__).parent
    repo_root = script_dir.parent
    source_claude = repo_root / ".claude"
    target_claude = target_dir / ".claude"

    info(f"來源 repo：{repo_root}")
    info(f"目標專案：{target_dir}")

    # 驗證來源與目標
    if not source_claude.exists():
        err(f"來源 .claude/ 目錄不存在：{source_claude}")
        err("請確認此指令碼是從 dotnet-testing-agent-orchestration-claude repo 執行")
        return 1
    if not target_dir.exists():
        err(f"目標目錄不存在：{target_dir}")
        return 1
    if target_dir == repo_root:
        warn("目標路徑與來源 repo 相同，將直接在本 repo 安裝 Agent Skills")

    step_results = {}

    step_results[1] = step1_copy_agents(source_claude, target_claude)
    step_results[2] = step2_copy_hooks(source_claude, target_claude)
    step_results[3] = step3_copy_repo_skills(source_claude, target_claude)
    step_results[4] = step4_install_agent_skills(target_claude)
    step_results[5] = step5_run_install_hooks(target_dir)
    verify = step6_verify(target_claude)

    # 摘要
    print()
    print("╔══════════════════════════════════════════════════════╗")
    print("║  安裝摘要                                            ║")
    print("╚══════════════════════════════════════════════════════╝")

    step_labels = {
        1: "複製 agents/",
        2: "複製 hooks/",
        3: "複製 repo skills/",
        4: "安裝 Agent Skills",
        5: "執行 install-hooks.js",
    }
    all_ok = True
    for n, label in step_labels.items():
        status = _c("32", "OK  ") if step_results[n] else _c("31", "FAIL")
        print(f"  [{status}] Step {n}：{label}")
        if not step_results[n]:
            all_ok = False

    print()
    verify_ok = (
        verify.get("agents") == EXPECTED_AGENTS
        and verify.get("hooks", 0) >= 3
        and verify.get("skills", 0) >= EXPECTED_TOTAL_SKILLS
        and verify.get("settings")
    )
    if all_ok and verify_ok:
        print(_c("32", "  安裝成功！所有驗證項目通過。"))
    else:
        print(_c("31", "  安裝完成，但部分項目未通過驗證，請確認上方錯誤訊息。"))

    print()
    info("後續步驟：在 Claude Code 中輸入 / 確認以下斜線指令可用：")
    print("  /dotnet-testing-orchestrator-unit")
    print("  /dotnet-testing-orchestrator-integration")
    print("  /dotnet-testing-orchestrator-aspire")
    print("  /dotnet-testing-orchestrator-tunit")
    print()

    return 0 if (all_ok and verify_ok) else 1


if __name__ == "__main__":
    sys.exit(main())
