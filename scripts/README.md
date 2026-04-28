# install-dotnet-testing-agents.py 使用說明

## 功能與用途

`install-dotnet-testing-agents.py` 是一個一鍵安裝指令碼，用於將 **dotnet-testing Agent Orchestration** 工作流程所需的全部元件安裝到指定的目標專案。

不需要手動執行多個安裝步驟——執行這支指令碼後，目標專案的 `.claude/` 目錄會自動完成以下所有設定：

| 安裝項目 | 說明 | 數量 |
| --- | --- | --- |
| `.claude/agents/` | 4 種工作流程的 Subagent 定義檔 | 16 個 .md 檔 |
| `.claude/hooks/` | 計時 Hook 腳本 | 3 個檔案 |
| `.claude/skills/` | Orchestrator Skills（本 repo 內建） | 5 個目錄 |
| `.claude/skills/` | Agent Skills（從 GitHub 下載） | 29+ 個目錄 |
| `.claude/settings.json` | hooks 配置（由 install-hooks.js 寫入） | 1 個檔案 |

安裝完成後，在 Claude Code 中即可使用以下斜線指令啟動測試工作流程：

```text
/dotnet-testing-orchestrator-unit
/dotnet-testing-orchestrator-integration
/dotnet-testing-orchestrator-aspire
/dotnet-testing-orchestrator-tunit
```

---

## 執行前的必要環境與條件

### 必要條件

| 條件 | 說明 | 驗證指令 |
| --- | --- | --- |
| **Python 3.8 以上** | 指令碼使用 `shutil.copytree(dirs_exist_ok=True)`，需要 Python 3.8+ | `python --version` |
| **Node.js（任意版本）** | 安裝完成後會執行 `install-hooks.js`，需要 `node` 在 PATH 中 | `node --version` |
| **網路連線** | Step 4 需要連線至 GitHub API 與 GitHub CDN 下載 Agent Skills | — |
| **磁碟空間（約 200MB）** | Agent Skills 的 zipball 約 100MB，解壓後約 200MB（含 PDF 文件） | — |

### 執行環境

此指令碼必須從 `dotnet-testing-agent-orchestration-claude` repo 內執行，因為 Step 1~3 是直接從本 repo 的 `.claude/` 目錄複製檔案到目標專案。

- **正確方式**：從 repo 根目錄執行，或將完整 repo Clone 後執行
- **不支援的方式**：僅複製單一 `install-dotnet-testing-agents.py` 檔案到目標專案後執行（缺少 `.claude/` 來源目錄）

### 不需要的項目

- 不需要安裝任何 Python 套件（指令碼只使用標準函式庫）
- 不需要 Docker（安裝過程本身不涉及容器）
- 不需要 .NET SDK（安裝過程本身不建置任何 .NET 專案）

---

## 使用方式

### 基本執行（目標為目前工作目錄）

```bash
cd /your-dotnet-project
python /path/to/dotnet-testing-agent-orchestration-claude/scripts/install-dotnet-testing-agents.py
```

### 指定目標專案路徑

```bash
python scripts/install-dotnet-testing-agents.py /path/to/your-dotnet-project
```

### Windows 範例

```bash
# 從 repo 根目錄執行，目標為另一個專案
python scripts\install-dotnet-testing-agents.py C:\Projects\MyDotNetApp

# 目標為目前工作目錄
cd C:\Projects\MyDotNetApp
python C:\github\dotnet-testing-agent-orchestration-claude\scripts\install-dotnet-testing-agents.py
```

### macOS / Linux 範例

```bash
# 從 repo 根目錄執行，目標為另一個專案
python scripts/install-dotnet-testing-agents.py ~/projects/my-dotnet-app

# 目標為目前工作目錄
cd ~/projects/my-dotnet-app
python ~/repos/dotnet-testing-agent-orchestration-claude/scripts/install-dotnet-testing-agents.py
```

---

## 安裝流程說明

指令碼依序執行以下 6 個步驟：

### Step 1：複製 `.claude/agents/`

將本 repo 的 16 個 Subagent 定義檔複製到目標專案的 `.claude/agents/`。

4 組工作流程各有 4 個角色（Analyzer / Writer / Executor / Reviewer）：

- 單元測試組：`dotnet-testing-analyzer.md` 等 4 個
- 整合測試組：`dotnet-testing-advanced-integration-analyzer.md` 等 4 個
- Aspire 測試組：`dotnet-testing-advanced-aspire-analyzer.md` 等 4 個
- TUnit 測試組：`dotnet-testing-advanced-tunit-analyzer.md` 等 4 個

### Step 2：複製 `.claude/hooks/`

將本 repo 的計時 Hook 腳本複製到目標專案的 `.claude/hooks/`：

- `dotnet-testing-agent-timer-pre.sh` — 記錄 Subagent 開始時間
- `dotnet-testing-agent-timer-post.sh` — 計算並輸出耗時
- `install-hooks.js` — 後續設定 `settings.json` 所需的工具

### Step 3：複製 `.claude/skills/`（本 repo 內建）

將本 repo 的 5 個 Orchestrator Skills 複製到目標專案的 `.claude/skills/`：

- `dotnet-test/` — .NET 測試執行器 Skill（含 references/ 子目錄）
- `dotnet-testing-orchestrator-unit/` — 單元測試 Orchestrator
- `dotnet-testing-orchestrator-integration/` — 整合測試 Orchestrator
- `dotnet-testing-orchestrator-aspire/` — Aspire 測試 Orchestrator
- `dotnet-testing-orchestrator-tunit/` — TUnit 測試 Orchestrator

### Step 4：下載 Agent Skills（從 GitHub）

從 [`kevintsengtw/dotnet-testing-agent-skills`](https://github.com/kevintsengtw/dotnet-testing-agent-skills) 抓取最新 release 的 zipball，解壓後將所有 Skill 目錄複製到目標專案的 `.claude/skills/`。

下載大小約 100MB（包含 PDF 說明文件），實際安裝的 Skills 約 29~30 個目錄。

### Step 5：執行 `install-hooks.js`

呼叫 `node` 執行 `install-hooks.js`，在目標專案的 `.claude/settings.json` 中寫入 `PreToolUse` 與 `PostToolUse` hooks 配置。此配置會讓 Claude Code 在呼叫 `dotnet-testing-*` Subagent 時自動記錄執行時間。

> 此步驟需要 `node` 可執行（見環境需求）。

### Step 6：環境驗證

安裝完成後自動驗證：

| 驗證項目 | 預期值 |
| --- | --- |
| `agents/*.md` 檔案數 | 16 個 |
| `hooks/` 檔案數 | 3 個以上 |
| `skills/` 目錄數（含 SKILL.md）| 34 個以上 |
| `settings.json` 存在 | 是 |

---

## 安裝輸出範例

```text
╔══════════════════════════════════════════════════════╗
║  dotnet-testing Agent Orchestration 安裝程式         ║
╚══════════════════════════════════════════════════════╝

[INFO] 來源 repo：/path/to/dotnet-testing-agent-orchestration-claude
[INFO] 目標專案：/path/to/your-project

Step 1: 複製 .claude/agents/（16 個 Subagent 定義檔）
──────────────────────────────────────────────────
[OK] 已複製 16 個 .md 檔案到/path/to/your-project/.claude/agents

Step 2: 複製 .claude/hooks/（計時 Hook 腳本）
──────────────────────────────────────────────────
[OK]   已複製：dotnet-testing-agent-timer-post.sh
[OK]   已複製：dotnet-testing-agent-timer-pre.sh
[OK]   已複製：install-hooks.js

Step 3: 複製 .claude/skills/（本 repo 內建的 5 個 Skills）
──────────────────────────────────────────────────
[OK]   已複製：dotnet-test/ （4 個檔案）
[OK]   已複製：dotnet-testing-orchestrator-aspire/ （1 個檔案）
...

Step 4: 下載 dotnet-testing-agent-skills 最新 Release
──────────────────────────────────────────────────
[INFO] 查詢 GitHub release：kevintsengtw/dotnet-testing-agent-skills
[INFO] 最新版本：v2.4.1
[INFO] 下載中：https://...
[OK] 下載完成：102800 KB
[INFO] 解壓縮中...
[OK] 已安裝 30 個 Agent Skills

Step 5: 執行 install-hooks.js（寫入 .claude/settings.json）
...

Step 6: 環境驗證
──────────────────────────────────────────────────
  [PASS] agents/*.md：16 個（預期 16）
  [PASS] hooks/ 檔案：3 個（預期 >= 3）
  [PASS] skills/ 目錄（含 SKILL.md）：35 個（預期 >= 34）
  [PASS] .claude/settings.json：存在

  安裝成功！所有驗證項目通過。
```

---

## 冪等設計

指令碼可安全重複執行，不會破壞已有設定：

- 檔案複製採覆蓋方式，確保目標與來源同步
- `install-hooks.js` 具有冪等設計（內容相同則跳過）
- 已有的 `.claude/settings.json` 其他設定不會被覆蓋

---

## 常見問題

**Q：Step 4 下載速度很慢或失敗**

Agent Skills 的 zipball 約 100MB（含 PDF 說明文件），下載時間取決於網路速度。若失敗，重新執行指令碼即可（Steps 1~3 為本地複製，不受影響）。

**Q：Step 5 出現「找不到 node 指令」**

確認 Node.js 已安裝，且 `node` 可在終端機中執行：

```bash
node --version
```

若未安裝，請至 [nodejs.org](https://nodejs.org) 下載安裝後再執行。

**Q：驗證顯示 skills 數量不符（FAIL）**

若 `dotnet-testing-agent-skills` repo 新增了更多 Skills，驗證的預期下限仍為 34，不會因為數量變多而 FAIL。若數量低於 34，可能是 Step 4 下載或解壓失敗，重新執行指令碼即可。

**Q：可以只重新安裝 Agent Skills 而不重複複製其他檔案嗎**

目前指令碼沒有選擇性執行的選項，完整重新執行即可（整個過程採覆蓋設計，不會造成損壞）。
