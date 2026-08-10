# Changelog

所有重要變更都記錄於此。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

## [v1.5.0] - 2026-08-10

共用技術 Skills 與 Claude 專屬 orchestration Skills 的路徑分離。共用技術 Skills 改以跨 Agent 生態慣例路徑 `.agents/skills/<skill-name>/SKILL.md` 作為 canonical location（注意是 `.agents` 複數）；Claude 專屬的 4 個 Orchestrator Skill 與 `dotnet-test` 維持在 `.claude/skills/`。subagent（Analyzer / Writer / Reviewer / Executor）以 `Read` 工具、**固定路徑** `.agents/skills/<name>/SKILL.md` 直接載入共用技術 Skill，不依賴 Claude Code 的原生 Skill 掃描，因此 `.claude/skills` 下**不需要**共用 Skill 的連結或副本。Agent 定義的 Skill 表格直接列出 `.agents/skills/...` 路徑，Analyzer 產出的短識別碼與 Skill selection 邏輯不變。四種 workflow、Analyzer → Writer → Executor → Reviewer 協作流程、run-state／artifacts schema、token 估算、hooks 與錯誤代碼一律未變更。配置與部署契約見 `docs/SKILL_LAYOUT.md`。

### 新增
- **Skill registry**（`.claude/scripts/skills/skill-registry.js`）：Skill 路徑分類的單一事實來源。提供 shared / claude-orchestration / claude-tool 三分類、識別碼→canonical 路徑對應（`TECHNIQUE_ALIASES`）、路徑正規化與去重（`canonicalizeSkillPath` / `dedupeSkillPaths`，防禦性地把殘留的 `.claude/skills/<shared>` 正規化回 canonical），以及以 **Skill ID**（非路徑前綴）分類的角色 read-scope 允許清單（`ROLE_READ_SCOPE` / `isSkillReadAllowed`）
- **doctor validator**（`.claude/scripts/skills/skills-doctor.js`）：檢查 canonical 來源存在、共用 Skill 未殘留在 `.claude/skills`（連結或副本皆算重複來源，附移除指令）、Claude 專屬 Skill 位置、orchestration Skill 未被誤搬、agent 定義未用 `.claude/skills/<shared>` 錯誤路徑，以及 registry 漂移；有錯誤時離開碼 1
- **測試**（`.claude/scripts/skills/skills.test.js`，32 項，零依賴）：路徑分類、canonical 路徑對應、雙前綴／Windows 分隔符／絕對路徑解析、殘留路徑去重、各角色 read-scope 邊界、doctor 各錯誤情境，以及真實 repo 佈局驗證（共用 Skill 只在 `.agents/skills`）
- `docs/SKILL_LAYOUT.md`：Skill 分類、直接路徑載入方式、read-scope 與 token 去重規則，以及 VS Code Extension／installer 的部署契約

### 變更
- 29 個 bundled 共用技術 Skills（`dotnet-testing-*`）由 `.claude/skills/` 移至 `.agents/skills/`
- **`unit-test-scenarios` 外部化**：不再內含於本 repo，改由專屬公開 repo [kevintsengtw/unit-test-scenarios](https://github.com/kevintsengtw/unit-test-scenarios) 提供（可選外部安裝）。registry 標記為外部來源共用 Skill、`skills-doctor` 不要求其實體存在（缺席為 info、非 error；若誤放 `.claude/skills` 仍報錯）。它是 orchestrator 流程外部的輔助工具，不被任何 subagent 以 Skill 形式載入，故移除不影響採用機制（採用機制吃的是提示詞中貼上的 Test Scenarios 文字）
- 16 個 agent 定義的 Skill 表格改為直接列出 `.agents/skills/<name>/SKILL.md` 路徑（subagent 以 `Read` 固定路徑載入），並加入 read-scope 邊界說明。既有短識別碼與 Skill selection 邏輯一律不變
- 4 個 Orchestrator Skill 的「禁止直接讀取 SKILL.md」改為語意式限制：不得載入或直接讀取任何技術型 Skill，明確涵蓋 `.agents/skills/**` 與 `.claude/skills/**`（本 Skill 除外）
- 同步 workflow 新增 `docs/SKILL_LAYOUT.md` 至公開 repo；`.claude/scripts/` 既有完整鏡射已涵蓋 skills registry/doctor 與測試
- **公開 repo 一鍵安裝腳本廢除**：`scripts/install-dotnet-testing-agents.py` 停止維護，安裝責任移轉至 VS Code Extension；`PUBLIC_REPO_README.md` 安裝章節改寫為「VS Code Extension（推薦）＋ 手動部署」兩條路徑，手動部署逐項列出 `.claude/agents/`、`.claude/hooks/`、`.claude/skills/`、`.claude/scripts/`、`.agents/skills/` 五個部署目標

### 修正
- **TUnit／Aspire 階段 4 的可略過矛盾**：兩者 SKILL.md 的階段 4 章節帶有【可略過】標籤與跳過條件（Executor 首次全過即跳過 Reviewer），與同檔案硬性禁止條款 #5「Reviewer 無論如何都必須執行」直接矛盾，實測導致 TUnit 首次全過時真的跳過品質審查。移除標籤與跳過條件，與 Unit／Integration 既有的無條件措辭對齊。修正後實機重測 TUnit 在**完全相同的觸發條件**下（13/13 通過、修正迴圈 0）確實執行 Reviewer，並抓到先前跳過那次無人知曉的真實缺陷：測試專案 `.csproj` 缺少 `<IsTestProject>true</IsTestProject>`（兩次 `dotnet test` 皆正常通過，故不會由測試結果暴露）
- **清理指令在 Windows 下無法解析，且失敗時無聲回報成功**：四份 Executor 的清理任務與 unit orchestrator 的 Phase 5 原以 `rm -rf {testProjectDir}/.orchestrator/` 刪除暫存目錄。範本結尾帶分隔符號，代入 Windows 反斜線路徑並加上引號後，尾端反斜線會跳脫結尾引號，指令在**解析階段**就失敗、根本不會送進 shell；原有的 `cmd /c rd /s /q` 備援預期的是「`rm -rf` 執行後失敗」，攔不到此情形。刪除一律改用 `node -e "require('fs').rmSync(...)"`（跨平台、不受 shell 引號影響，`node` 為既有需求），並明訂路徑一律正斜線、結尾不得帶分隔符號；`cmd /c rd` 備援移除（其針對的情境已不存在，保留只會遮蔽真正的失敗）。同時新增驗證步驟：刪除後確認目錄確實消失，取得 `CLEANUP_OK` 才得回傳 `cleanup-completed`，否則回傳 `cleanup-failed` 並附殘留清單，且**不重試**（已知失敗模式為指令字串無法解析，非暫時性，重試只會掩蓋正要觀察的訊號）。清理範圍未變動（unit 維持只刪 `executor-result/` 並保留 `analysis/`，其餘三套維持刪除整個 `.orchestrator/`）；Phase 0 前置清理委託同一段清理任務，一併受惠
- **Phase 5 被整份略過（`.orchestrator/` 殘留的真正根因）**：四份 orchestrator 的「各階段必要輸出」表把 token 報表列為**「真正最後一步」**、Token 章節自稱**「強制最終輸出」**與「整個工作流程的最後一個必要產出」，而 Phase 5 要求在結果呈現「之後」才執行——終止契約指向 Phase 5 以外的步驟，且衝突的另一方帶 ⛔ 強度。同時 Phase 5 是全流程唯一在該表中**沒有任何必要輸出**的步驟（全篇僅 2 次提及、自我檢查清單無對應項），既無機制促其執行，「未執行」與「執行了但沒講」在回覆中亦無法區分，只能靠殘留檔案反推。實測 Integration 連兩次從階段 4 直接進入 token 統計、全程未出現 Phase 5，而同批 TUnit／Aspire 正常執行——四份 Phase 5 章節措辭逐字相同，無文字差異可歸咎，屬欠缺執行機制下的非決定性行為。修正：把 Phase 5 納入強制輸出契約——必要輸出表新增「Token 表格之後（真正最後一步）」一列並移除 token 報表的終止標記、Token 章節改為「強制輸出」並明示其非流程結尾、修改流程收尾同步比照、自我檢查清單新增收尾鎖點，並要求 Phase 5 於可見回覆輸出一行狀態（`✅ Phase 5 後置清理完成` 或 `⚠️ …未完成 — 殘留：{清單}`）作為回覆最後一行。**該狀態行明訂必須依實際輸出決定**（unit 依驗證指令 stdout 的 `CLEANUP_OK`／`CLEANUP_FAILED`，其餘三套依 Executor 回傳的 `cleanup-completed`／`cleanup-failed`），不得憑印象或推定寫入，以免以假數據取代缺失。四份的 Phase 5 提及次數由 2 增為 8、章節位置一律未動

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
