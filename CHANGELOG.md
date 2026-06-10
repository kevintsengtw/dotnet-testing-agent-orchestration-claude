# Changelog

所有重要變更都記錄於此。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

## [v1.1.1] - 2026-06-09

### 修正
- Token 用量引擎在 IDE / 非 CLI 環境下找不到 session transcript（`report` 永遠印「找不到當前 session transcript，略過」）：根因是引擎以 `encodeProjectPath`（僅換 `: \ /`）推算 `~/.claude/projects/<資料夾>` 名稱，無法重現 Claude Code 更廣的正規化（實測 `_`→`-`、大小寫差異），導致推算資料夾不存在。改以 runtime 權威 `CLAUDE_CODE_SESSION_ID` 跨 `~/.claude/projects/*/` 直接定位 `<sid>.jsonl`，免於路徑編碼差異；取不到時才回退最近 mtime 掃描。Windows 與 macOS / Linux 行為一致
- `start` 寫入 marker 的 transcript 路徑於 `report` 可作後備還原；`report` 略過時改印可診斷訊息（projectDir / jsonl 數等）

### 新增
- `token_usage.js locate`（別名 `diagnose`）子指令與 `report --verbose`：輸出自我定位診斷（`resolvedVia` = env-fast / env-glob / mtime / none）

## [v1.1.0] - 2026-06-08

### 新增
- 測試工作流程 Token 用量記錄功能：四個 orchestrator（unit / integration / aspire / tunit）跑完 1+4 流程後，自動於結果最後呈現 Token 用量表（input 分純 / cache 寫入 / cache 讀取＋含快取合計＋output），涵蓋 Orchestrator 主執行緒與全部 subagent
- 跨平台 Node.js 引擎 `.claude/scripts/token-usage/token_usage.js`：零依賴、只讀 session transcript、不裝 session 級 hook，產出報告與可累積比較的 ledger
- `docs/TOKEN_USAGE_GUIDE.md` 使用說明

### 變更
- `sync-to-public.yml` 納入 `.claude/scripts/` 與 `docs/TOKEN_USAGE_GUIDE.md` 同步，確保 public repo 同步後 Token 功能可運作

## [v1.0.0] - 2026-05-13

### 新增
- 建立 GitHub Actions 自動同步工作流程（lab → public repo）
- 新增 PUBLIC_REPO_README.md 作為 public repo 的 README 來源
- 新增 CHANGELOG.md 版本記錄
