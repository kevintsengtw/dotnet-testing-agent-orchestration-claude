# Changelog

所有重要變更都記錄於此。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

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
