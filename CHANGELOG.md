# Changelog

所有重要變更都記錄於此。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

## [v1.3.0] - 2026-06-22

TUnit 練習專案補上 FluentValidation 驗證器目標，補齊 TUnit 工作流程缺少的 validator 測試情境（unit 範例早有 3 個 validator，TUnit 範例先前一個都沒有）。經 net8 / net9 / net10 三版本 `dotnet build` 與 net9 端到端工作流程驗證（Analyzer 正確判定 `targetType=validator`、`forbidWriterSplit=true`、單一 Writer、`dotnet run` 全數通過）。本次僅異動 lab-only 內容（`samples/`、TUnit 使用指南、README），產品 agents / skills 未變。

### 新增
- TUnit 練習專案新增 `LibraryMemberValidator`（繼承 `AbstractValidator<LibraryMember>`）至 net8 / net9 / net10 三版本 src，含 5 條基本欄位規則（Name、Email、MembershipType、PhoneNumber 條件格式、JoinDate）與 2 條跨欄位規則（Vip 須為資深會員、Premium / Vip 必填電話），透過建構子注入 `TimeProvider`（預設 `TimeProvider.System`）使日期規則可由 `FakeTimeProvider` 控制
- 三版本 src `.csproj` 加入 `FluentValidation 11.11.0`（對齊 unit 範例版本）；測試專案 `.csproj` 不變動，`FluentValidation.TestHelper` 經 `ProjectReference` 由 src 傳遞性引入，維持測試專案空白起點
- `docs/TUNIT_TESTING_USAGE_GUIDE.md` 新增 validator 觸發範例與驗證重點（4.5 節）；`samples/tunit/practice_tunit/README.md` 補上 `Validators/` 目錄與 `LibraryMemberValidator`（P3-6）學習場景

## [v1.2.0] - 2026-06-16

dotnet-testing-orchestrator-unit 單元測試工作流程強化。針對大型類別分割（多 Writer 平行）的跨檔不一致（L-1）、Legacy 跨平台難測、並行 csproj 競態等問題，調整 `analyzer` / `writer` / `reviewer` 三個 agent 與 unit orchestrator skill。經三支未污染驗證（多目標分割 / legacy / validator 非分割對照）確認生效且非分割路徑零退步。

### 新增
- **測試類別標準範本**（`dotnet-testing-writer`）：定義所有 Writer（分割與否）必須照抄的唯一骨架——using 排序、XML class 註解格式、欄位順序、constructor 區塊順序、region 命名、AAA 標示、helper 命名與固定正值策略。根治分割路徑「釘死即一致、未釘必漂」的跨檔漂移，取代逐條補規則
- **Legacy 跨平台混合設計（opt-in）**：`dotnet-testing-analyzer` 偵測「靜態 File.IO + 硬編絕對路徑 + 無 IFileSystem」時，於分析報告產出 `productionRefactorSuggestion` 旗標；`dotnet-testing-reviewer` 據此於審查報告顯著呈現 `productionRefactorOptIn` 建議；unit orchestrator skill 加入「production 重構需使用者同意才執行」的修改流程。**預設不修改 production**，相關 workaround issue 不升為 error

### 變更
- unit orchestrator skill 的「風格統一指令」精簡：分割 Writer 一律遵循 writer.md 標準範本，Orchestrator 只傳 per-run 差異（SUT 變體、FakeTimeProvider 初始時間、constructor null-guard 歸屬），不再逐條重列
- Constructor null-guard 測試與 `.csproj` 修改於分割時**只由主組 Writer 1 負責**，分割組僅在 writer-result 宣告所需套件，避免兩檔重複與並行寫同一 `.csproj` 的競態；多目標時由循序的 Executor 作為 `.csproj` 最終收斂點
- `dotnet-testing-reviewer` 跨檔一致性查核擴充：constructor 區塊順序、欄位順序、XML 註解、region、AAA、helper 策略、ctor null-guard 歸屬

### 修正
- net10.0（或測試專案無 global using）時，Writer 產出的測試檔自帶 `using Xunit;`，消除 Executor 補 using 的修正輪
- 中文測試方法名含 `%`、`.` 等非法 C# 識別字字元時，於 Writer 端轉語意化中文（`%`→`百分之N`、`.`→`點`），消除 CS1003 修正輪
- 強化「一測一行為」：路徑驗證與內容驗證分屬不同測試，消除 legacy workaround 易誘發的混合斷言
- 強化 legacy 命名全中文：禁止 `C_Reports` 類英文縮寫入測試方法名

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
