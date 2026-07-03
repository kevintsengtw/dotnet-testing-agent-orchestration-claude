# Changelog

所有重要變更都記錄於此。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

## [v1.4.0] - 2026-07-03

使用者測試情境採用機制 MVP（單目標＋整段貼上）。讓使用者事先以 `unit-test-scenarios` skill 產出的 Test Scenarios 文件，能被 `dotnet-testing-orchestrator-unit` 工作流程直接**採用**，而非由 Analyzer 自行從原始碼重新生成場景。範圍限定單一目標＋整段貼上提示詞、`testData` 恆為 `null`；多目標配對、附加檔案來源留待後續擴充。經 `OrderProcessingService.ProcessOrderAsync`（單方法、Option A 部分排除）與 `WeatherAlertService`（類別級、全採用）兩種範圍端到端驗證通過，皆一次建置成功、測試全數通過。設計見 `docs/USER_SCENARIO_ADOPTION_DESIGN.md`。

### 新增
- **場景偵測與交接**（`dotnet-testing-orchestrator-unit`）：新增 Phase 0.6，純判讀提示詞內是否貼有結構化 Test Scenarios 文字（不算探索、不受「啟動 Analyzer 前不得探索」限制），偵測到時於 Analyzer prompt 附加 `userProvidedScenarios` 區塊；結果整合新增「採用摘要」，顯著呈現本次涵蓋與排除的方法清單
- **來源收斂與 Option A**（`dotnet-testing-analyzer`）：新增 Step 0.5 解析 `unit-test-scenarios` 固定輸出格式（Happy Path / 邊界條件 / 例外條件 / 分支規則與決策表 / 狀態與副作用 / Characterization Tests）為 `scenarioSpecs[]`，解析失敗時明確回報並退回 generated 模式，不靜默丟棄或半採用；`methodsToTest` 依採用場景收斂（Option A：只納入有場景的方法，其餘列入 `excludedMethods`，技術分析範圍隨之收斂）；輸出新增 `scenarioSource`/`adoptedMethods`/`excludedMethods`/`scenarioSpecs`；≤6 字命名限制與 Step 6.5 數量一致性驗證對採用場景放行/改錨點
- **採用模式撰寫規則**（`dotnet-testing-writer`）：讀取 `scenarioSpecs` 作為撰寫依據（名稱／Priority／AAA／Rule／Note），延續既有設計**不因採用而跳過讀原始碼**——場景描述與原始碼實際行為分歧時，以原始碼為準落實斷言並記入 `divergenceNotes[]`；完整性原則收斂至採用場景集合，不替被排除方法或場景未涵蓋的類別主動補測試
- 未提供場景時（`generated` 模式）三個檔案的既有行為**逐位元不變**：所有新增邏輯皆以 `userProvidedScenarios.present` / `scenarioSource === "adopted"` 為條件包裹
- 新增 `.claude/skills/unit-test-scenarios/`：獨立於 orchestrator 之外，供使用者對任意 .NET 類別／方法產出結構化 Test Scenarios 文件的輔助 skill，是本機制的場景來源

## [v1.3.2] - 2026-07-02

Writer agent 死碼清理。`dotnet-testing-writer` 的 Step 3（讀取被測試目標原始碼）有一段「若 Analyzer JSON 的 `methodSignatures` 已含完整方法簽章則跳過讀取原始碼」的 skip 條件，但 `dotnet-testing-analyzer` 從不輸出 `methodSignatures`、且明令禁止輸出 `methodsToTest[].returnType`，使該 skip 的 guard 永遠不成立——為不可達死碼，亦為日後可能被誤觸而降低測試品質的陷阱。經跨四套工作流程（Unit / Integration / Aspire / TUnit）× net8/9/10 共 33 次執行實證確認變更行為中性、無品質倒退。設計與驗證見 `docs/superpowers/specs/2026-06-30-writer-dead-handoff-skip-design.md`。

### 修正
- **清理不可達 skip 死碼**：`dotnet-testing-writer` Step 3 移除「若 `methodSignatures` 完整則跳過讀原始碼」的 skip 條件（guard 永不成立），改為 unit 專屬設計註記，明文鎖定「Analyzer 刻意不輸出 `methodSignatures` / `methodsToTest[].returnType`，回傳型別與方法實作行為一律由 Writer 讀原始碼取得」，防止日後被誤加回。**執行期行為不變**（skip 原本即不可達）；此變更僅限 unit writer——經查其餘三套 writer 無此 skip、改用 `sourceCodeContext` 交接，不受影響

## [v1.3.1] - 2026-06-22

驗證器測試產出一致性修正。為 TUnit 範例新增 `LibraryMemberValidator` 後，對 net8 / net9 / net10 三版本各跑一次工作流程，暴露 Writer 對「時間相依 validator」與「FluentValidation 套件歸屬」的兩處非預期不一致。修正 `dotnet-testing-advanced-tunit-writer`、`dotnet-testing-writer`、`dotnet-testing-advanced-tunit-reviewer` 三個 agent。經 TUnit net8 / net9 / net10 與 Unit `OrderValidator` 四條路徑重新驗證，規則一致生效（net8 由前次建置失敗轉為 19/19 通過）。設計與計畫見 `docs/superpowers/specs/2026-06-22-writer-validator-time-csproj-design.md`。

### 修正
- **時間相依 validator base object（規則 A）**：`dotnet-testing-advanced-tunit-writer` 與 `dotnet-testing-writer` —— 當 validator 驗證的日期欄位需對齊「注入的 `TimeProvider`」時，`CreateValid{Model}()` helper 必須為 instance 方法、時間欄位由 `_timeProvider.GetUtcNow().UtcDateTime` 推導，禁用 `DateTime.UtcNow` / `DateTime.Now` / 寫死日期字面值，消除真假時鐘混用（非時間相依 validator 維持 static + 固定值，零變動）
- **FluentValidation 套件歸屬（規則 B）**：兩個 Writer 明定 validator 目標**保持測試專案 `.csproj` 不動** —— 禁止新增 `FluentValidation` PackageReference，也禁止為取得 FluentValidation 而新增任何 `ProjectReference`；既有指向 SUT 的 `ProjectReference` 已傳遞性提供 `FluentValidation` 與 `TestHelper`。修掉前次 net8 加套件、net10 誤加跨版本 `ProjectReference`（NU1201 建置失敗）的不一致
- **TUnit Reviewer 對齊規則 B**：`dotnet-testing-advanced-tunit-reviewer` —— validator 的傳遞性 FluentValidation 為設計上正確狀態，不得標記為問題或建議新增 `PackageReference` / `ProjectReference`，使判準與 `dotnet-testing-reviewer` 一致（先前會把傳遞性依賴標為 FAIL/改善點）

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
