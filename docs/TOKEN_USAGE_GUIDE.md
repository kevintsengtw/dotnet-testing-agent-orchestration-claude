# Token 用量記錄使用指南

記錄「單次測試工作流程執行」（Orchestrator 主執行緒 ＋ Analyzer / Writer / Executor / Reviewer
全部 subagent）所使用的 token 量，input 明確分為「純 input ／ cache 寫入 ／ cache 讀取」並提供
「含快取 input 合計」與 output，產出繁中報告與可累積比較的 ledger。

## 設計重點

- **整合進測試工作流程本身**，不是獨立 skill、不裝任何 session 級 hook
  （UserPromptSubmit / Stop / SessionEnd）。因此**不會影響非測試工作流程的其他工作**。
- 由四個 Orchestrator skill 在「耗時表之後」呼叫引擎一次，把 token 用量表附在結果最後。
- 引擎：`.claude/scripts/token-usage/token_usage.js`（單一跨平台 Node.js，零依賴，**只讀 transcript**）。
- 跨平台：Windows / macOS / Linux 一律用 `node`（指令同名，免直譯器 fallback）；與既有 `.claude/hooks/` 的 Node 工具一致。

## 資料來源（已於本環境驗證）

唯一可靠來源是 Claude Code 自身寫的 session transcript（與 ccusage 同源）。本版結構：

```text
~/.claude/projects/<encoded-project>/<session-id>.jsonl            主 transcript（Orchestrator 主執行緒）
~/.claude/projects/<encoded-project>/<session-id>/subagents/
    agent-<id>.jsonl        每個 subagent 一個檔（各帶 message.usage）
    agent-<id>.meta.json    {"agentType": "dotnet-testing-...", "description": "..."}
```

> subagent **不是**以 `isSidechain` 寫進主 transcript，而是各自獨立檔案。引擎合併「主 transcript ＋
> `subagents/` 子目錄」，只計 `agentType` 以 `dotnet-testing-` 開頭的 subagent（排除 `Explore` /
> `general-purpose`），即可精準涵蓋 Orchestrator ＋ 4 個 subagent。

## 運作方式（整合進四個 Orchestrator）

四個 Orchestrator skill 在流程中呼叫引擎兩次（皆 best-effort、失敗即略過）：

1. **Phase 0.5 — `start <framework>`**：Phase 0 清理完成後、啟動 Analyzer 之前，標記計量起點（寫 marker）。
   這讓 **Phase 0 清理用的 Executor 落在窗口外被排除**，主執行緒也只計階段 1 之後、更精準。

   ```bash
   node .claude/scripts/token-usage/token_usage.js start <framework> 2>/dev/null
   ```

2. **耗時表之後 — `report <framework>`**：輸出 `### ⏱ 各階段耗時` 表後，計算並把精簡 token 表附在結果最後。
   **修改流程（套用 Reviewer 建議）結果呈現後也會再呼叫一次**，因 marker 起點不變 → 輸出「含修改的累計用量」。

   ```bash
   node .claude/scripts/token-usage/token_usage.js report <framework> 2>/dev/null
   ```

引擎**自我定位**當前 session：**優先用 runtime 注入的權威 `CLAUDE_CODE_SESSION_ID`**，以該 sid 跨
`~/.claude/projects/*/` 直接找到對應的 `<sid>.jsonl`（**免於路徑編碼與資料夾命名差異**，見下方「自我定位」）；
僅在取不到該變數或其檔尚未落地時，才回退「編碼資料夾中最近寫入的 `<id>.jsonl`」。
把精簡表格印到 stdout（Orchestrator 附在結果最後），並把完整報告與 ledger 寫到 `token-usage-reports/`。

不需安裝、不需接線、不需重啟 session——隨工作流程自動產生。

### 「單次 run」如何框定

- **優先用 marker 起點**（Phase 0.5 的 `start` 寫入）：window = `[start_ts, 現在]`，
  排除 Phase 0 cleanup、精準涵蓋階段 1 起的主執行緒與所有 `dotnet-testing-*` subagent。
- **後備（無 marker 時）**：以「最近一群 `dotnet-testing-*` subagent」框定，window = `[最早 subagent, 現在]`，
  同一 session 內多次工作流程以時間間隔（預設 30 分鐘）自動分群，只統計最近一次。
- 修改流程二次 `report` 沿用同一 marker 起點與 `run_id` → ledger 以 upsert 累計，不會新增重複列。

## 產出

| 路徑 | 說明 |
| --- | --- |
| `token-usage-reports/latest.md` | 最近一次 run 報告 |
| `token-usage-reports/run-<時間>-<run_id>.md` | 每次 run 各一份 |
| `token-usage-reports/ledger.jsonl` | 累積帳本（run_id upsert，可跨次比較） |
| `token-usage-reports/pricing.config.json` | 使用者自填單價（選用） |

報告分區：總覽（input 三分項 + 含快取合計 + output）、分項 by scope（角色 ×次數）、分項 by 模型、
成本估算（選用）、subagent 明細。`token-usage-reports/` 已 gitignore。

## 成本估算（選用，附帶功能）

本功能重點是「每次工作流程用了多少 token」；成本為選用。預設關閉、不寫死單價。要啟用：

```powershell
# Windows
Copy-Item .claude\scripts\token-usage\pricing.config.example.json token-usage-reports\pricing.config.json
```

```bash
# macOS / Linux
cp .claude/scripts/token-usage/pricing.config.example.json token-usage-reports/pricing.config.json
```

`rates` 的 key 須與 transcript 的 `message.model` 一致；單價單位為「每百萬 token (per MTok) 美元」。
單價以官方價目為準自行填入：<https://docs.claude.com/en/docs/about-claude/pricing>。

## 驗證

### 自我測試（合成 transcript）

```bash
node .claude/scripts/token-usage/token_usage.js selftest
```

> 開發用更細的單元測試：`node .claude/scripts/token-usage/token_usage.test.js`。

驗證：各 scope 加總、`Explore` 排除、`含快取 input = 純+寫+讀`、窗口過濾、writer×N 聚合計次、
缺 cache 欄以 0 計、subagent-cluster 框定。

### 手動檢視最近一次（不經 Orchestrator）

```bash
node .claude/scripts/token-usage/token_usage.js report 2>/dev/null
```

### 與 ccusage 對帳（選用）

```bash
npx ccusage@latest session
```

同一資料源、同口徑，數字應一致。差異常見原因：ccusage 是整 session 累計，本工具是單一 run 窗口；
或 ccusage 對 `subagents/` 子目錄的納入口徑差異。`/context` 可做量級側看。

> 備註：`cache 讀取` 為各回合累積讀取量（與 ccusage 同口徑），非唯一 token 數。

## 跨平台注意事項

| 項目 | Windows | macOS / Linux |
| --- | --- | --- |
| 直譯器 | `node`（同名） | `node`（同名） |
| 呼叫 | 單一 `node …js` 指令，免 fallback | 同左 |
| Bash 工具 | Git Bash (MINGW)，Windows 路徑可用 | 原生 sh/bash |
| 路徑編碼 | `c:\...` → `c--...` | `/Users/...` → `-Users-...` |
| session 定位 | `CLAUDE_CODE_SESSION_ID` + 跨資料夾 glob | 同左 |

> 引擎以 cwd / 腳本位置自我定位專案根，不依賴 `CLAUDE_PROJECT_DIR`（該變數在 Bash 環境可能為空）。

### 自我定位（為何不靠路徑編碼）

Claude Code 的 `~/.claude/projects/<資料夾>/` 命名，其正規化規則比「`: \ /` → `-`」更廣
（實測 `_` 也會被換成 `-`、亦含大小寫差異），引擎無法保證逐字重現該資料夾名。
因此引擎改以 runtime 注入的權威 **`CLAUDE_CODE_SESSION_ID`** 為主：sid 全域唯一，
直接跨 `~/.claude/projects/*/` 尋找 `<sid>.jsonl`，**與資料夾如何編碼無關**，Windows 與
macOS / Linux 行為一致。診斷時可執行：

```bash
node .claude/scripts/token-usage/token_usage.js locate
```

輸出 `resolvedVia`：`env-fast`（推算資料夾即命中）／`env-glob`（跨資料夾命中）／
`mtime`（無權威 sid，回退最近寫入）／`none`（定位失敗，附 projectDir / jsonl 數等診斷）。
`report` 失敗略過時也會印出同類診斷資訊，並可加 `--verbose` 觀察定位過程。

## 設計鐵則

- 對 transcript 只讀不寫；任何錯誤靜默結束（exit 0），不阻斷 bypassPermissions 自動流程。
- 不裝 session 級 hook；input 三分項分開；不寫死 token 單價；不對內容做任何壓縮 / 精簡。
- 命名不使用 `dotnet-testing-*` 前綴（該前綴專屬 dotnet-testing-agent-skills 系列）；
  本功能為 Orchestrator 內嵌工具，置於 `.claude/scripts/token-usage/`。
