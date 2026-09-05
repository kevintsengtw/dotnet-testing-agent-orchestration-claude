# Changelog

所有重要變更都記錄於此。格式參考 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

## [v1.7.1] - 2026-09-05

修正 tunit Analyzer 產出的場景名稱殘留英文識別字。tunit 的 Writer（重要原則 7）與 Reviewer
（命名規範表）早有「情境與預期段出現連續 3 個以上英文字母即違反、值與型別保留、識別字譯中文」
的機械判準，**唯獨 Analyzer 只有「重要原則 5：中文三段式命名」一句話、沒有判準**。
場景名稱是 Writer 的直接輸入，源頭殘留會一路帶到測試方法名，Reviewer 每跑一次就標一次 WARN——
v1.7.0 驗證批次的 tunit T-02 即出現 5 個含 `Email` 的方法名，Reviewer 明確指出根因在 Analyzer。

**只動 `dotnet-testing-advanced-tunit-analyzer.md` 一個檔案；四階段協作、hooks、錯誤代碼、
其餘三套工作流程一律未變更。**

### 修正

- **tunit Analyzer 移植 unit Analyzer 的命名判準**：重要原則 5 補上機械判準、白名單
  （例外型別名、列舉型別與列舉值、語言字面值、型別成員值）、違反清單（參數名、屬性名、欄位名）
  與「值與型別保留、識別字譯中文」的分界原則，並註明所有 `targetType` 一律適用
- **Step 6**：產出場景名稱的當下即套用判準，**不得留給 Writer 轉換**
- **Step 6.5**：新增第 3 項機械對帳——寫入交接檔案前逐一場景名掃描，違反者就地改為中文
- **重要原則 11、12 的範例自身違規**：`isRenewal` → 續約狀態、`MaxRenewals` → 最大續借次數；
  `MembershipType` 屬列舉型別、在白名單內，維持原文

### 驗證

一條端到端驗證通過，記錄於 `docs/comparison/verification/scenario-naming/`。標的、測試專案、
提示詞與 v1.7.0 的 tunit T-02 **逐字相同**，故可直接對照：

| | T-02（v1.7.0，修正前） | T-01（修正後） |
| --- | --- | --- |
| `suggestedTestScenarios` 含 `Email` | 5 | **0** |
| 測試方法名含 `Email` | 5 | **0** |
| Reviewer 命名面向 | ⚠️ WARN（合規率約 88%） | ✅ PASS（**100%**） |
| 白名單（`ArgumentNullException`、`KeyNotFoundException`、`為null`…） | — | **全數保留原文**，未被過度中文化 |
| 建構子場景（v1.7.0 行為） | 4 | 4（無退化） |
| 執行 | 42/42 綠 | 53/53 綠、0 修正輪 |

> **已知限制**：樣本數 1。同一條規則在 unit 側已隨 v1.6.0 實測多輪，本次是移植而非新設計。

---

## [v1.7.0] - 2026-09-04

unit 與 tunit 兩套工作流程補上**建構子場景強制列管**。起因是 lite-lab 的對照 benchmark 暴露一個規則缺口：
現行三條建構子相關規則（Analyzer Step 2 依賴分析、Writer 撰寫規範、Reviewer 檢核）
沒有一條要求「所有 public 建構子都要有測試」，只涵蓋**有 `?? throw new ArgumentNullException`
防禦**的參數。結果是 `OrderValidator() : this(TimeProvider.System)` 這類無參數、無 null guard、
只委派給另一個建構子的 public 建構子完全掉出待測範圍——本工作區 5 份留存產出物
（exp-08 與 agent-autonomy-validation 四輪）的建構子測試命中數**全部為 0**。

tunit 的缺口更大：**Writer 端原本完全沒有建構子規則**，連 null guard 的都沒有，只有 Reviewer 有。

**Analyzer → Writer → Executor → Reviewer 的四階段協作、hooks 與錯誤代碼一律未變更；
integration 與 aspire 兩套工作流程未動**（兩者測的是 HTTP 端點與 Aspire Resource，
建構子列管不適用）。

發現紀錄見 `docs/comparison/coverage-gap-finding-from-lite-lab.md`，
修改計畫與完整驗證紀錄見 `docs/comparison/unit-constructor-scenario-plan.md`。

### 新增

- **Analyzer 新增 Step 2.5「建構子場景強制列管」**：所有 `targetType` 一律執行，列出原始碼中
  **明確宣告**的所有 public 建構子（含只委派給其他建構子者、每個多載），各產出至少一個首段為
  `Constructor` 的場景；有 null guard 的參數各加一個防禦場景，參數名依命名規範譯為中文。
  `methodScenarioCounts` 必含 `Constructor` 條目，但**不計入** `methodCount`。

  落點必須在 Analyzer 而非只補 Writer：本工作區是 1+4 架構，Writer 的場景來源是
  `suggestedTestScenarios`；且 validator 目標跳過 Step 3 方法簽章分析、場景全部來自
  Step 1.5 的規則展開，建構子原本沒有任何進入場景的管道。

- **兩個例外**：類別無任何 public 建構子（`static`，或建構子皆非 public）；
  類別在原始碼中**未宣告任何建構子**（只有編譯器產生的隱含無參數建構子）。後者若不排除，
  `TemperatureConverter`、`LegacyReportGenerator` 這類類別會被逼出一個無意義測試，
  且 Reviewer 對帳會產生假陽性。

- **Reviewer 新增建構子測試覆蓋對帳**，severity 依缺漏來源分流：
  `suggestedTestScenarios` 有列該場景、測試檔卻沒寫且 `writer-result.deviations` 未記錄理由
  → `error`（契約違反）；分析報告未列、Reviewer 讀原始碼才發現 → `warning`（覆蓋缺口）。
  兩者一律列入 `missingTestCases`。

- **`rules/unit-writer-validator.md`** 明文授權建構子場景，避免被該檔「測試方法總數以
  `suggestedTestScenarios` 為基準（上限 150%）」的規定排擠。

- **tunit 同步補上同一條規則**，措辭依 tunit 的差異重寫、未照抄 unit：
  - `tunit-analyzer` 新增 **Step 3.5**（`Step 2.5` 已被「目標類型識別」佔用）、Step 6.5 對帳、
    重要原則第 15 條；Validator 分支明訂不得略過
  - `tunit-writer` 新增 **3.10.5 建構子測試** —— 此前 tunit Writer **沒有任何**建構子規則。
    規則明講「測的是**被測類別**的建構子」，與測試類別用 `[Before(Test)]` / `[After(Test)]`
    的生命週期區分開
  - `tunit-reviewer` 4g 覆蓋率表新增建構子測試覆蓋，嚴重度分流對應為
    **FAIL**（已列管卻沒寫且無 `deviations`）／**WARN**（分析報告未列、讀原始碼才發現），
    因 tunit Reviewer 用 PASS／WARN／FAIL 而非 `error`／`warning`／`suggestion`

### 修正

- **Writer 建構子命名範本與契約層自相矛盾**：`dotnet-testing-writer.md` 原規定
  `Constructor_{參數名稱}為null_應拋出ArgumentNullException`，但同檔契約層明列參數名屬
  「識別字」必須譯為中文，Reviewer 更以「第 2 段出現連續 3 個以上英文字母」機械判定、違反即
  `error`。照原文寫出的 `Constructor_timeProvider為null_...` 會被自家 Reviewer 判 error。
  範本改為 `{中文參數描述}`。此缺陷與本次新增無關、在 `master` 上獨立存在。

- **`docs/comparison/README.md` 還原程序**：原註解宣稱 `git clean -fd` 會清除
  `.orchestrator/`，實際上該目錄被 `.gitignore` 擋著清不掉，殘留會污染下一次實驗的起始條件。
  補上 `fs.rmSync` 與驗證指令，並註明 `experiments/*/prompt.md` 是當時的執行記錄、
  不是提示詞格式範本（觸發格式以根 `README.md` 為準）。

### 驗證

八條端到端驗證全部通過（unit 五條、tunit 三條），記錄於 `docs/comparison/verification/ctor-scenario/`。
全部由使用者於乾淨 session 手動執行並貼回原始回覆，Claude 僅出題、檢查、記錄、還原；
提示詞零引導，回報數字一律經磁碟核對。

| # | 標的 | 驗什麼 | 結果 |
| --- | --- | --- | --- |
| E2E-01 | `OrderValidator`（net10、validator） | 規則生效 + 覆蓋率 | 2 個建構子場景與測試齊備；30/30 綠、Reviewer A |
| E2E-02 | `WeatherAlertService`（net10、service） | null guard 分支 + 中文參數名 | 3 個場景（1 建立 + 2 防禦）；36/36 綠、0 命名 error |
| E2E-04 | 刪掉 E2E-01 的建構子測試後重審 | `error` 分支 | A → C+；`missingTestCases` 精確命中 |
| E2E-05 | 另從 analysis 移除建構子場景後重審 | `warning` 分支 | 判 `warning` 並明載降級理由 |
| E2E-03 | `TemperatureConverter`（net10、未宣告建構子） | 規則**不得**過度生效 | 0 個建構子場景、Reviewer A+ 無假陽性 |
| T-01 | `LibraryMemberValidator`（tunit／net9、委派建構子） | tunit 規則生效 | 2 個建構子場景與對應 `[Test]`；28/28 綠 |
| T-02 | `LibraryMemberService`（tunit／net9、3 個 null guard） | tunit null guard 分支 | 4 個場景（1 建立 + 3 防禦）、中文參數描述；42/42 綠 |
| T-03 | `BookCatalog`（tunit／net9、未宣告建構子） | tunit **不得**過度生效 | 0 個建構子場景；Writer 主動記錄「符合略過規則」、Reviewer 標 WARN 而非 FAIL |

`OrderValidator` 的 line coverage 由 **88.57%**（uncovered `[17,18,19,96]`）提升至
**97.14%**（uncovered `[96]`）；`[96]` 是被 `.When()` 短路的 `return true;`，判為 uncoverable。
正向流程除 T-03 有 2 次與建構子無關的修正輪（`%` 非法識別字、`BeEquivalentTo` 誤用於 bool／decimal）外，其餘皆 0 修正輪、測試全綠。覆蓋率量測為一次性手動執行，**未接入工作流程**。

> **已知限制**：八條各跑一次，樣本數 1。同一份測試檔在兩次 Reviewer 執行中，`[Theory]`
> 合併問題一次判 `suggestion`、一次判 `error`，故所有判準都設在機制層
> （場景清單、測試方法、覆蓋行號、`issues[].severity` 明細），不採用 `overallScore`。

---

## [v1.6.0] - 2026-09-01

單元測試工作流程的架構調整：把 `dotnet-testing-*` 共用技術 Skills 從「法典」改為「可選參考」，
技術選擇與寫法細節交還給 agent 判斷，硬約束收斂為專案慣例、輸出契約與測試全綠三項。
同批修正四套 Orchestrator 的輸出契約、Phase 5 收尾判準與 Token 表格的輸出攔截，
測試命名殘留英文識別字的兩層根因，四個 Writer 版本規則的自相矛盾，
以及三個 Writer 因「版本確認」條文缺口而執行無界檔案系統掃描的問題。
**Analyzer → Writer → Executor → Reviewer 的四階段協作、hooks 與錯誤代碼一律未變更；
integration 與 aspire 兩套工作流程除輸出契約外未動。**

共 **38 次實機執行**（前置調查 17 次 + 架構調整驗證 21 次，其中 1 次因受前次留存產出
污染而作廢），全部由使用者手動執行、
零引導提示詞、回報數字經磁碟核對。記錄見 `docs/comparison/phantom-api-validation/` 與
`docs/comparison/agent-autonomy-validation/`，設計文件見
`docs/superpowers/specs/2026-08-18-workflow-agent-autonomy-design.md`。

### 變更

- **移除 Writer 分割**（unit 與 tunit）：一個被測類別固定產出一個測試檔案，不再依
  `methodCount > 5` / `scenarioCount > 20` 拆分為平行 Writer。

  起因是三次獨立執行都重現跨檔案漂移，且**每次漂移的面向都不同** —— 例外委派宣告
  （`var act` vs `Action act`，兩次方向相反）、例外斷言是否驗 `WithParameterName`
  （一檔 7 次一檔 0 次）、同名 `CreateValid{Type}()` 預設值語意分歧（薪資 50,000 vs
  100,000）、`using` 排序自行改為字母序。先前的處理方式是逐條補列舉規則，但
  「規則列舉到哪裡，一致性就守到哪裡」—— 未列舉的面向必然繼續漂移，而
  **平行 Writer 之間無法協調預設值，「兩檔一致」本質上不可機械執行**。

  改為單一檔案後此類問題整體消失。連帶刪除 helper 後綴命名、Constructor null-guard
  歸屬、`.csproj` 主組歸屬、orchestrator 的風格統一指令與 per-run 差異參數，以及
  unit Reviewer 的跨檔一致性 15 項與 tunit Reviewer 的 9 項。

  實測合併後單檔為 500～750 行（29～49 個測試），與既有單檔產出同一數量級。

- **Analyzer 只描述客觀事實，不再指派技術**：刪除 `requiredTechniques` 與
  `skillMap.reviewer` 兩個輸出欄位、Step 6 的四張技術判定條件表、Step 6.1 的 Reviewer
  Skill 清單計算，以及 Step 5 的「強制加入的技術」對照表。

  依據為 9 次執行、15 個被測目標的實測：條件表產出的技術有 7 項命中率為 **0%** ——
  `autodata-xunit-integration`（7 次載入 0 次使用）、
  `autofixture-nsubstitute-integration`（5/0）、`test-data-builder-pattern`（5/0）、
  `autofixture-bogus-integration`（2/0）、`autofixture-customization`（2/0）、
  `private-internal-testing`（1/0）、`bogus-fake-data`（3 次載入 1 次使用）。
  全部 unit 產出中 `AutoData` 出現 0 次、`AutoNSubstitute` 0 次、Builder 類別 0 次。
  失準的觸發條件都是主觀或幾乎恆真（「需要 AutoData 參數化測試」「有 2+ 個 Mock 依賴」）。

  基礎設施掃描保留，結果改為如實寫入既有的 `existingTestInfrastructure` 欄位。

- **Writer 的 Skill 取用改為目錄自選**：預載 `unit-test-fundamentals`、
  `test-naming-conventions`、`xunit-project-setup` 三項基礎，其餘 16 個以目錄形式提供
  （逐項標註「什麼時候用得上」），由 Writer 讀完原始碼後自行決定。read-scope 維持 19 個，
  未放寬。重要原則 1 從「Skills 優先，不要用自己的知識覆蓋 Skill 的指引」改為
  「Skill 是參考，不是法典 —— 要不要用那項技術是 Writer 的判斷」。

- **Writer 規則分為契約層與建議層**：契約層五項（AAA 標記、中文三段式命名、
  AwesomeAssertions、`#region` 分組、路徑跨平台）維持「必須／禁止」，不接受偏離；
  建議層七項（單一行為、AutoFixture 優先、`BeEquivalentTo` 優先、邊界值標註、清除 using、
  `[InlineData]` 展開、例外斷言寫法）改為預設做法，偏離時須在 `writer-result.deviations`
  記錄理由。

- **Reviewer 改風險導向三段式**：核取項由 49 降為 30。① 契約檢核（違反即 error，
  不接受理由）② 偏離審查（讀 `deviations` 判斷理由是否成立；有記錄且理由成立不算缺失）
  ③ 風險導向審查（核心必查 + 依 `targetType` 與依賴特徵展開）。
  未使用的 `using` 一項刪除，交由編譯器的 `IDE0005` / `CS8019` 在 Executor 建置階段回報。

### 新增

- `writer-result` 新增 `skillsConsulted`（取代 `skillsLoaded`，語意從「被指派」改為
  「自選的結果」）與 `deviations`（偏離建議層的規則與理由，無偏離時為空陣列，不得省略）
- `.claude/agents/rules/unit-writer-validator.md` 與 `unit-writer-legacy.md`：目標型別專屬
  規則外置，由 Writer 依 `targetType` 條件讀取，一般目標不再載入這 40 行
- 四套 Orchestrator 的「必呈現的內容」新增 **`.csproj` 變動**：逐筆列出套件名與版本前後，
  **即使為空也必須明說「未變動」**。實測案例：某次執行升版 6 個套件（含
  `Microsoft.NET.Test.Sdk` 17→18、`xunit.runner.visualstudio` 2→3、`coverlet.collector`
  6→8 三個主版號跳躍），`writer-result` 有完整記錄但結果整合隻字未提
- 四套 Orchestrator 的「必呈現的內容」新增 **非測試程式碼變更**：逐一列出檔案路徑、
  變更摘要與變更原因，**未修改時亦須明說**。實測案例：Aspire Writer 依其明文規則修改了
  `AppHost/Program.cs` 這個 `src/` 下的生產程式碼
- unit Orchestrator 的「必呈現的內容」新增 **Writer 的技術選擇**：呈現 `skillsConsulted`
  與 `deviations`，`deviations` 為空時亦須明說。技術選擇權交還 Writer 之後，這是使用者
  判斷它選得對不對的唯一依據

### 修正


- **Phase 5 收尾契約造成偽陰性**：四套 Orchestrator 原以「⛔ 回覆中沒有這一行 = 流程未完成」
  作為 Phase 5 的**唯一**判準（各 2 處）。該判準只驗可見回覆是否含某行文字、不驗事實，
  任何插入回覆流的環境事件（客戶端彈窗、終端截斷、複製遺漏）都會讓已正常完成的流程被判為
  異常。實測案例：執行尾聲客戶端跳出設定精靈，狀態行未出現在回覆，但磁碟顯示
  `executor-result/` 已刪除。修正：狀態行維持強制輸出，但新增缺席時的判讀規則 ——
  一律**以磁碟為準**（unit 檢查 `.orchestrator/executor-result` 是否消失，其餘三套檢查
  `.orchestrator/` 是否整個消失）
- **Reviewer 得以建議與指令相反的方向**：四份 Reviewer 原將物件比較寫為「應統一使用
  `BeEquivalentTo()` **或**屬性逐一斷言」，而 orchestrator 與 Writer 範本皆指定
  `BeEquivalentTo()` 優先。寬鬆的措辭使 Reviewer 得以合法建議相反方向 —— 實測中即發生。
  修正：改為與指令同向，並明訂不得建議與建議層相反的方向
- **tunit Analyzer 未跟上 Writer 分割移除**：本版移除 unit 與 tunit 的 Writer 分割後，
  `dotnet-testing-advanced-tunit-analyzer.md` 仍在 5 處要求輸出 `forbidWriterSplit: true`
  並描述 `methodScenarioCounts` 供 Orchestrator「判斷是否需要 Writer 分割
  （methods>5 / scenarios>20）及如何分組」。全庫搜尋確認該欄位**零消費者** ——
  tunit orchestrator 階段 1 列出的預期欄位清單本來就不含它，tunit Writer 亦未引用。
  屬強制輸出卻無人讀取的死欄位，與 v1.3.2 清理的死碼 skip 同型。移除該欄位與分割敘述，
  `methodScenarioCounts` 用途改為與 unit 逐字相同的「掌握各方法的場景分佈，
  用於進度顯示與結果彙整」；Step 2.5 validator 流程與 `requiredSkills` 規則未動。
  同批修掉 unit／tunit 兩份 Analyzer 中同一句「確保**多個 Writer 並行時各自的**
  base object 均能通過所有驗證規則」的殘留措辭（僅為欄位用途說明，不含指示）。
  前後對照見 `docs/comparison/agent-autonomy-validation/exp-11`／`exp-12`：
  場景數 21、測試方法 21、測試檔案 1、0 修正輪、全綠，三個結構性指標完全一致。
  **該欄位是否仍被輸出無法由實機驗證** —— 規格把它放在精簡摘要（回傳訊息）而非磁碟上的
  交接檔案，exp-12 保留整個 `.orchestrator/` 亦查無此欄位；結論依據為靜態證據
  （Analyzer 定義中該指示的文字已不存在）
- **AwesomeAssertions 不存在的斷言 API**：`BeGreaterOrEqualTo` / `BeLessOrEqualTo` /
  `HaveCountGreaterOrEqualTo` 是 FluentAssertions 5.x 的舊名稱，AwesomeAssertions 只保留
  `...ThanOrEqualTo` 形式，複製受影響範本會直接造成 `CS1061`。修正
  `.claude/agents/dotnet-testing-advanced-tunit-writer.md:371` 的 `[MethodDataSource]`
  教學範例（本 repo 自己內嵌，非上游問題）
- **測試命名殘留英文識別字（兩層根因）**：實機驗證於三個情境共測得 **20 處**違反 ——
  參數名（`timeProvider`、`reservation`、`bookRepository`）與屬性名（`ProductName`、
  `Quantity`、`Items`、`ExpiresAt`）直接進入測試方法的情境段。追查後為兩層：

  **Analyzer** 的巢狀 Validator 場景命名範本自身規定嵌入 `{PropertyName}`，與同檔
  「必須使用中文三段式、每段最多 6 個中文字」的通則直接矛盾，且專用範本壓過通則。
  改為中文範本並在通則補上英文識別字禁令，明訂適用於所有 `targetType`。

  **Writer** 的掃描義務有寫但未被執行 —— 原措辭舉例全是 `C_Reports`、`userId` 這類
  小寫或泛用詞，與實際違規的 PascalCase 屬性名比對不上；且「直接採用 `suggestedTestScenarios`
  命名」的指示醒目，掃描義務埋在第四層子項。改為「先通過檢查才可採用」的前置條件，
  並把禁令改寫為可機械判斷的判準：**方法名第 2、3 段出現連續 3 個以上英文字母即檢視，
  分界原則為「程式碼中的值與型別保留原文，識別字必須譯為中文」**。

  白名單（例外型別名、列舉值、語言字面值、型別成員值）**經 93 個實際產出的方法名反向
  校準** —— 首版判準會誤判 `True`/`False`（16 處）與 `null`（14 處），兩者皆為語言字面值，
  且 `null` 本就列在規則自身的「情境常用詞彙」中；不修正會憑空製造 30 個歷次審查從未
  視為問題的「違規」。同一判準與白名單同步至 tunit 的 Writer 與 Reviewer（原本 tunit
  完全沒有此條款）。
- **Analyzer 對條件式規則的場景列舉不足**：`crossFieldRules[]`（`When`／`Unless`）與
  `customMethods[]`（`Must()`）**只列失敗分支、不列成功分支**。一般屬性規則的成功分支由
  「所有欄位合法」場景集體涵蓋，但條件式規則不然 —— 合法基底物件通常讓條件不成立
  （`CreateValid{Type}()` 預設 `ProcessedAt = null`，使 `When(x => x.ProcessedAt.HasValue)`
  底下的規則從未被觸發），該規則的成功路徑於是從未被執行。**測試會全綠，但那條規則只驗過
  一半。**

  對照證據：有明文強制展開條款的巢狀 Validator，場景數三輪穩定為 8／8／8；沒有條款的
  `crossFieldRules` 則為 6／4／4。修正方式是**補上同一形式的條款**而非發明新機制 ——
  Analyzer 的 Validator 專用分析新增「條件式規則場景展開（強制）」，每條規則須各產出失敗與
  成功兩個場景，`When`／`Unless` 的條件本身有「不成立」語意分支時再加一個；並附自我比對
  下限（條目數 × 2）。Reviewer 同步新增「條件式規則覆蓋率」審查，避免又變成 Analyzer 被
  要求、Reviewer 不檢查。修正後條件式場景數回升至 8。
- **Token 用量表格缺席且無補救機制**：實測一次未輸出，而該表格標示「強制輸出，不可省略」。
  Token 段落原已有自我檢查（「我是否已把 stdout 表格貼進可見回覆？」）仍被跳過，故不再
  增補提醒文字，改為**把攔截點前移一步**：原有的「已貼出 Token 表格、正準備結束回覆？」
  預設表格已貼，攔不到跳過的情況；新增「已貼出耗時表、正要進入 Phase 5 或輸出收尾提示？
  → 停止，Token 表格必須先貼」。並補上與 Phase 5 狀態行同型的**缺席判讀規則**：缺席不代表
  流程異常（成敗以 Executor 回報與磁碟狀態為準），transcript 仍在可事後補取，不得因此重跑
  整個工作流程。四套一律套用。

- **「取較高者為準」的版本規則與保守策略自相矛盾，造成未記錄的靜默偏離**：四個 Writer 的
  版本適配邏輯同時寫著「SKILL.md 版本與 `.csproj` 既有版本取較高者為準」與「不主動升級，
  套件版本由專案維護者決定」。`.csproj` 版本較低時兩者直接衝突 —— 照前者應改寫 `.csproj`，
  照後者應維持不動。

  實測落差：`filesystem-testing-abstractions` SKILL.md 記載
  `System.IO.Abstractions.TestingHelpers 22.1.0`，測試專案 `.csproj` 為 `21.1.3`，
  依條文應取 `22.1.0`，Writer 實際沿用 `21.1.3`，且 `nugetChanges` 為空、`deviations`
  未記錄。**行為本身合理，但條文說的是另一回事，而且沒有任何地方留下痕跡。**

  改為依「既有／新增」分流，取消「較高者」：

  1. **新增套件**（`.csproj` 尚無該 `<PackageReference>`）→ 採用 SKILL.md 記載的版本
  2. **既有套件** → **維持 `.csproj` 既有版本不動**，不因 SKILL.md 較新而升版。唯一例外
     是既有版本確實缺少測試所需的 API 或不支援目標框架（如 `TimeProvider.Testing 10.0.0`
     無 `lib/net10.0/`），此時才升到 SKILL.md 版本
  3. **新增「禁止靜默改版」**——`.csproj` 的任何版本變動都必須逐筆列入 `nugetChanges`
     （格式 `套件名 舊版 → 新版（原因）`），未列入即視為未發生

  矛盾與靜默偏離同時消除：維持既有版本現在**就是規則**，不再算偏離、也就不需要記錄；
  而任何實際改動都必然留下 `nugetChanges` 紀錄。這也與 CLAUDE.md「測試專案必須保持初始
  狀態」一致。四套一律套用 —— 含 `advanced-aspire-writer`（其「版本通用：SKILL.md 與
  .csproj 取較高者為準」是同一條文的精簡版，前一項無界掃描修正則不涉及該檔）。
  禁止降版維持不變。

- **Writer 的「版本確認」條文導致無界檔案系統掃描**：實測中 `dotnet-testing-writer`
  為了確認 `System.IO.Abstractions.TestingHelpers` 的版本，自行組出並執行
  `find / -ipath "*..." | grep ... | head -20`——**從根目錄掃描整個檔案系統**。
  `head -20` 取滿即結束，但上游的 `find` 不會因此停止；Writer agent 早已回傳結果，
  該 shell 成為孤兒 process，實測存活約 **70 分鐘**持續佔用磁碟 I/O。

  **根本原因是規格缺口，不是 agent 判斷失誤**：條文要求版本號必須「經確認存在」（產生義務），
  卻未提供任何合法的確認途徑（拿掉正當手段），唯一看似相關的
  `dotnet list package --outdated` 又被明文禁止（再拿掉一個），且無任何條文限制 Bash
  的使用邊界、agent 為 `bypassPermissions`（移除阻力）。四項條件同時成立，agent 於是
  自行外推出一個未被預期的做法。

  修正**四個** writer 定義檔（`dotnet-testing-writer`、`advanced-integration-writer`、
  `advanced-tunit-writer`、`advanced-aspire-writer`）：

  1. **定義「確認存在」的合法途徑**——只能讀 `.csproj` 的 `<PackageReference>` 或
     SKILL.md 記載的版本，兩者皆為本地檔案；明文禁止為了確認版本而搜尋檔案系統。
     兩個來源都查不到時直接沿用 `.csproj` 既有值並記錄，不得自行探查
  2. **新增「禁止無界檔案系統掃描」原則**——不得以檔案系統根目錄或使用者家目錄為起點
     遞迴搜尋（`find /`、`find ~`、`find "$HOME"`、`find "$USERPROFILE"`、`C:/Users`
     起點、`ls -R /`、`Glob("**/*")`），**無論是否加上 `| head -N`**；`head` 只截斷輸出、
     不終止上游 process。需要搜尋時必須指定明確的起始目錄並限制在專案範圍內，
     且優先使用可被追蹤與中斷的 `Read`／`Grep`／`Glob` 工具而非 Bash 的 `find`

     **同時提供「查不到時的出路」**：本地來源沒有的 API 就當它不存在，改用已確認可行的
     等價寫法並記一筆。**這一條是禁令能否成立的關鍵** —— 修正初期只有 aspire 拿到出路，
     另三個 writer 只拿到禁令，結果 integration 在遇到 Testcontainers API 不確定時仍執行了
     `find /`（並事後自行 `taskkill` 善後）。同一處境下有出路的 aspire 改用了等價寫法。
     **禁令配死路，等於沒有禁令** —— 這與本問題最初的成因（要求做某事卻沒說怎麼做）
     是同一個機制的變體。四套一律套用。

     **另補「不得讀取 `docs/`」**：Writer 只讀被測專案、測試專案、SKILL.md 與交接檔案。
     實測曾發生 Writer 讀取先前留在 `docs/` 下的完整測試檔並**逐字沿用**（404 行零差異，
     該次驗證因此作廢）。使用者的 repo 同樣可能有過時或屬於其他目標的範例。
  3. **擴充既有的「不執行 `dotnet list package --outdated`」條文**——涵蓋檔案搜尋、
     網路查詢、執行 CLI 等所有探查手段，明訂版本資訊只從 `.csproj` 與 SKILL.md 取得

  **`advanced-aspire-writer` 一度被判定為不受影響，該判定已被實測推翻。**
  原理由是它沒有「未經確認存在的版本號」條文、不會產生「必須確認」的義務；但驗證中
  aspire Writer 仍執行了 `find /`、`find "$HOME"`、`find "C:/Users"`，孤兒 process
  存活 **25 分鐘以上**。動機根本不是版本 —— 它在確認 `AwesomeAssertions.Web` 是否有
  `Be409Conflict` 這個**方法**。

  真正的觸發條件只有「需要一項本地來源查不到的資訊」加上「沒有任何條文限制 Bash 的邊界」，
  版本義務只是前者的來源之一。**因此修正 2（無條件禁止無界掃描）才是關鍵，修正 1
  只管版本、射程蓋不到 API 探查。** aspire 已補上同一條原則，並加上查不到時的出路：
  SKILL.md 沒有示範的斷言方法就當它不存在，改用等價寫法（如
  `response.StatusCode.Should().Be(HttpStatusCode.Conflict)`）並記錄 ——
  **沒有出路的禁令會把 agent 逼回自行外推，那正是這個問題的成因。**

  根因鏈：aspire Writer 的 read-scope 只有 `aspire-testing` 一個 Skill，該 Skill 的
  templates 示範了 200/201/204/400/404 五個狀態碼方法，**唯獨沒有 409**，而被測目標有
  三個 409 端點。Skill 側的補充另提修改建議
  （`docs/skills/SKILL_FIX_PROPOSAL_dotnet-testing-advanced-aspire-testing.md`）。

  對產出無影響：兩次相關執行分別為 113 與 25 個測試全數通過、`src/` 未被修改。
  這是資源與流程缺陷，非正確性缺陷。詳見
  `docs/skills/AGENT_FIX_PROPOSAL_dotnet-testing-writer.md`（含第 7 節訂正）。
- **分批啟動的 Writer 覆蓋同名交接檔，套件變動紀錄整批消失**：integration 在
  `scenarioCount > 15` 時分兩批啟動 Writer（第一批基礎設施、第二批測試案例），
  兩批寫入的是**同一個** `{ControllerName}.writer-result.json`。第一批建立 `.csproj`、
  套件變動全記在它那筆；第二批自己確實沒動套件，直接 `Write` 覆蓋後 `nugetChanges`
  變成 `[]`。

  實測結果：`.csproj` 實際新增 5 個套件，交接檔案卻寫「未新增/變更任何 NuGet 套件版本」。
  **這讓同批新增的「禁止靜默改版」條款在該路徑上形同虛設** —— 該條款的判準正是
  「未列入 `nugetChanges` 即視為未發生」。使用者當時仍看到完整清單，只因第一批的回傳
  訊息還在 orchestrator 的 context 裡；落到磁碟的稽核紀錄是錯的。

  修正 `advanced-integration-writer`：分兩批時第二批**必須先 `Read` 既有 writer-result，
  將 `nugetChanges` 與 `infrastructureFiles` 合併後再寫回**，不得覆蓋；`testCount`、
  `testFilePaths`、`testClasses`、`modifiedAt` 以第二批為準。原本只有 `mode: "modification"`
  有讀取既有檔案的條文，分批情況沒有對應規定。

  對照組：aspire 同批以單一 Writer 執行，`nugetChanges` 6 筆齊全且各附理由，
  Executor 的 `addedPackages` 亦完整 —— 確認問題出在分批覆蓋，不是規則本身失效。

- **「新增套件採 SKILL.md 版本」過於絕對，實測有三個反例**：前一條的版本決定規則把新增
  套件一律指向 SKILL.md，但驗證中出現三種 SKILL.md 給不出正確答案的情形：

  | 套件 | SKILL.md | 實際採用 | 為什麼 |
  | --- | --- | --- | --- |
  | `Aspire.Hosting.Testing` | 13.1.3 | **13.1.2** | 依 aspire 既有的「Aspire 對齊」規則與 AppHost 同步，**優先於 SKILL.md** |
  | `MongoDB.Driver` | 3.7.1 | **3.1.0** | 對齊生產專案；寫較高版本會經由 `ProjectReference` 把生產端相依一併拉高 |
  | `StackExchange.Redis` | 未記載 | 2.8.41 → **2.9.32** | 對齊生產專案後撞上 `Aspire.Hosting.Redis 13.1.2` 的傳遞下限，`NU1605` 建置失敗，由 Executor 升版 |

  第二與第三筆看似矛盾 —— 對齊生產專案有時對、有時撞牆 —— 所以**不能寫成絕對規則**。
  改為有優先序、且以 Executor 為安全網的判定：① 有專屬對齊規則者依該規則
  → ② **生產專案已引用者，對齊生產專案版本**（即使 SKILL.md 記載更高版本）
  → ③ 生產專案沒用而 SKILL.md 有記載者用 SKILL.md → ④ 皆無則自行判斷並在 `nugetChanges`
  寫明依據；任一結果與傳遞相依下限衝突時由 Executor 升版並記錄，
  **Writer 不需也不得為此預先查詢**。四套一律套用。

  ②與③的先後**經實測修正過一次**：初版把 SKILL.md 排在生產專案之前，
  結果 `MongoDB.Driver` 被寫成 SKILL.md 的 `3.7.1`，高於生產專案的 `3.1.0` ——
  測試專案的 `ProjectReference` 會經由 NuGet 版本統一把生產端相依一併拉高。
  **「不要繞道改動生產專案版本」這個理由，與該套件有沒有出現在 SKILL.md 無關**，
  故對調。

  三次實測中 Writer 的每一筆選擇都走對了，且理由都寫進了 `nugetChanges` ——
  **落後的是條文，不是行為。**

- **命名判準只有 unit 與 tunit 有，integration 與 aspire 沒有**：v1.6.0 修正測試命名殘留
  英文識別字時，補上了「程式碼中的**值與型別**保留原文、**識別字**必須譯為中文」的機械判準，
  但只加在 `dotnet-testing-writer` 與 `advanced-tunit-writer`。實測 aspire 產出
  `依狀態查詢預約_狀態有對應資料_回傳200並依CheckInDate降冪排序` —— `CheckInDate` 是屬性名，
  依判準應譯為「入住日期」，但該檔沒有這條規則，Reviewer 判定 PASS 亦屬正確。

  這與同批已修的「tunit 命名 parity」是同一種缺口，只是換到另外兩套。
  `advanced-integration-writer` 與 `advanced-aspire-writer` 的 Rule 2 補上同一張判準表
  （白名單增列回應型別名 `ProblemDetails`／`ValidationProblemDetails` 與 HTTP 標頭名
  `Location`、`ETag`，皆屬「值與型別」）。aspire 的 Rule 2 原本只有一行標題、無任何內容，
  一併補上命名格式與範例。

- **TUnit Writer 的原則 9 自相矛盾且引用不存在的步驟**：原文為「TUnit 與 Testing.Platform
  的版本鏈鎖必須遵守。SKILL.md 中的 `0.6.123` 為最低保證版本，**實際版本由 Step 1.5
  `--outdated` 查詢結果決定**（見原則 0）」。三個問題疊在一起：`Step 1.5` 在該檔案中
  **不存在**（全檔僅原則 9 自己提及）；`--outdated` 被原則 0 明文禁止；而它援引原則 0
  作為依據，原則 0 說的卻正好相反。原則 0 同時寫著「TUnit 版本遵循版本鏈鎖定（見原則 9）」，
  兩者互指形成循環。

  查證「版本鏈鎖定」的實際定義（同檔「版本適配邏輯」第 2 點）：`TUnit` 是 meta-package，
  內含 `Microsoft.Testing.Platform` 等傳遞依賴，升級時只需升 `TUnit` 本身、傳遞依賴自動
  跟隨 —— **與版本查詢無關**。原則 9 的敘述本身即為誤植。

  改寫為：`.csproj` 只指定 `TUnit` 一個版本號、不個別指定傳遞依賴；版本取值同原則 0
  （SKILL.md 與 `.csproj` 既有值取較高者），不查詢、不探查，並改為指向「版本適配邏輯」
  的具體條目而非回指原則 0，循環引用一併解除。

### 移除

- Writer 規範中的 `[AutoData]` 使用建議 —— 9 次執行實測命中率 0%，且 Writer 的測試類別
  標準範本本身並未使用 AutoData，載入了規範、範本卻是反方向

### 驗證

全部由使用者手動執行並貼回原始回覆，Claude 僅出題、檢查、記錄、還原；提示詞零引導，
回報數字一律經磁碟核對；執行者為與修正調查無關的乾淨 session。

#### 前置調查（四輪、17 次執行）

記錄於 `docs/comparison/phantom-api-validation/`。

| 輪次 | 範圍 | 結果 |
| --- | --- | --- |
| 第一輪（探索） | Unit ×3 | 不採計為驗證，但 `.csproj` 未呈現、Phase 5 偽陰性兩項修正由此挖出 |
| 第二輪 | 四套 × 6 條 | 238/238 全綠 |
| 第三輪 | 會分割的 3 條 | 166/166 全綠 |
| 第四輪 | 四套 × 4 條**全新靶標** | 122/122 全綠、**全 0 修正輪** |

這 17 次執行確立了兩件事：`.csproj` 與非測試程式碼變更的必呈現契約有效；以及
**列舉式跨檔一致性守不住**（三次執行漂移面向皆不同）—— 後者正是本版移除 Writer 分割的
直接依據。skill 命中率的量測亦來自這批執行留存的 `writer-result.json`。

#### 架構調整驗證（六輪、21 次執行）

記錄與彙整見 `docs/comparison/agent-autonomy-validation/`（[SUMMARY](docs/comparison/agent-autonomy-validation/SUMMARY.md)）。
每輪暴露的問題修正後，**受測對象已變更故全部重跑**。

| 輪 | 範圍 | 結果 |
| --- | --- | --- |
| 第一輪 | unit / tunit / validator 各 1 | 暴露命名違反 20 處、Token 表格缺席 |
| 第二輪 | 同三個情境（命名與 Token 修正後）+ 1 次變異測試 | 違反全數歸零；發現條件式規則場景不足 |
| 第三輪 | validator（條件式規則修正後） | 條件式場景數 4 → **8**，修正生效 |
| 第四輪 | unit 四種規模（成本量測） | 多目標流程首次驗證 |
| 第五輪 | **integration / aspire 首次執行** + unit 關鍵靶標，含 5 次修正後重驗 | 見下 |
| 第六輪 | tunit / validator 前後對照（Analyzer 分割敘述清理） | 結構性指標一致，未分割 |

**前四輪 11 次執行全數建置成功、測試全綠、0 修正輪**（舊設計同批曾有 2 輪）；
`samples/` 與 `src/` 全程零變更。

**第五輪（8 次執行）補上 integration 與 aspire** —— 前四輪全部落在 unit（9 次）與
tunit（2 次），而本版同時改動了四套的輸出契約。這一輪抓出三個只在這兩套才會出現的缺陷：

| # | 靶標 | 抓到什麼 |
| --- | --- | --- |
| exp-07 | unit `ConfigurationLoader` | 無界掃描修正生效（該靶標正是前次事故現場） |
| exp-08 | integration `CustomerActivitiesController` | **分批 Writer 覆蓋同名交接檔**，`nugetChanges` 整批消失 |
| exp-09 | aspire `BookingsController` | **無界掃描在未修改的 aspire writer 上重現**，孤兒 process 存活 25 分鐘以上 |
| exp-09-r2 | 同上 | 出路條款生效，改用等價寫法，0 次掃描 |
| exp-08-r2 | 同 exp-08 | 合併修正生效，但**只有禁令沒有出路的 integration 仍違規** |
| exp-08-r3 | 同上 | **作廢** —— Writer 讀取前次留存產出並逐字沿用（404 行零差異） |
| exp-08-r4 | 同上 | 隔離後乾淨通過；暴露版本優先序②③排序錯誤 |
| exp-10 | integration `OrdersController`（21 場景） | 分批合併、`modificationType`、版本優先序三項一次驗到 |

第五輪的價值不在於「又跑了八次」，而在於**每一次失敗都改變了修正本身**：
禁令要配出路、優先序要把生產專案排在 SKILL.md 之前、驗證產出不能留在工作區。

**四項架構變更全部成立**：

- **移除分割**：所有情境皆產出單一測試檔；多目標為一類別一檔（3 檔，舊設計 5 檔）
- **Analyzer 只描述**：`analysis.json` 已無 `requiredTechniques` / `skillMap` / `forbidWriterSplit`
- **Skill 目錄自選**：unit 載入 6 個（舊設計 8 個），**全部有產出證據**；舊設計 8 個中有 1 個未使用
- **Reviewer 三段式**：同一靶標同一輸入，30 個核取項抓到舊設計 49 項清單漏掉的命名違規
  （舊設計 Reviewer 給 B+ 並明載「無 error 級」）

**目標型別規則外置**亦成立：`targetType === "validator"` 時條件載入 `unit-writer-validator.md`，
其中只寫在該檔的規則 A（`CreateValid{Type}()` 改 instance 方法、時間由 `_timeProvider` 推導、
禁 `DateTime.UtcNow`）與規則 B（`.csproj` 不動、禁新增 FluentValidation PackageReference）
**四次執行全數成立**。

**規則分層的偏離審查兩條路徑皆驗到**：前七次執行 `deviations` 皆為空陣列，機制從未被實質
觸發；第四輪出現兩筆有效記錄（理由具體綁定被測目標，Reviewer 判定成立、不列缺失），
同一次執行中 Reviewer 亦抓到一筆**未記錄的偏離**（`CreateValidOrderItem()` 手動
`new` 而非 AutoFixture），磁碟核對屬實。**「有記錄且理由成立」與「未記錄」兩種情況皆能
正確分辨。**

**命名修正雙向核對**：20 處違反全數歸零；同時確認白名單未被誤傷 ——
語言字面值（`為null`、`應回傳true`）、列舉值（`Expired`、`Active`、`OnLoan` 等 23 處）、
例外型別名皆保留原文，過度中文化徵兆 0 處。

#### 成本量測（四種規模）

| 規模 | 舊設計 Writer 數 | 舊設計 | 新設計 | 差 |
| --- | ---: | ---: | ---: | ---: |
| 單一方法 | 1（**未分割**） | 4,960,765 | 4,795,746 | **−3.3%** |
| 單一類別 | 2（分割） | 7,964,596 | 4,675,755 | **−41%** |
| 單一類別 | 2（分割） | 7,162,028 | 4,634,505 | −35% |
| 多類別（3 目標） | 5 | 19,410,159 | 12,973,867 | **−33%** |

**降幅只跟舊設計啟動幾個 Writer 相關，與被測目標規模無關。** 未觸發分割時持平，觸發後
33～41%。逐階段歸因（單一類別組）：Writer 由 2 個變 1 個時成本 **−50%**（幾乎正好對半）、
Reviewer −65%（跨檔一致性 15 項刪除）、Orchestrator −33%（分割決策刪除）、
Analyzer **+17%**（新增條件式規則強制展開，唯一上升的一項）。

**此結果與改動前的假設相反**：靜態載入內容（4 份 agent 定義 + orchestrator + skills）
合計約 101,865 tok，僅占單次執行 cache 寫入的 **10.6%**；真正的成本在平行 Writer 各自
累積一整份 context。**結論不是「新設計比較省」，而是「分割本身很貴」。**
加規則的代價可量化（Analyzer +6～17%），且被其他階段的下降完全吸收。

#### 未驗證與待追蹤

- **Phase 5 缺席判讀**：28 次執行（含前置調查）皆未遇環境彈窗，缺席路徑始終未被觸發
- **只驗證失敗側／明顯值**（已確認為系統性，**七次獨立執行、跨三套工作流程**皆出現）：
  邊界值只測「超出上限」缺「剛好等於邊界」的成功案例（`LessThanOrEqualTo` 被誤改成
  `LessThan` 時測不出來）、營業時間只測明顯值未測臨界點、閾值只測非邊界值、多因子加成
  各自被隔離測試而**加總邏輯從未被驗證**（「若改成取最大值也抓不到」）、
  `MockFileSystem.CreateDirectory` 是 idempotent 故「目錄已存在不重建」的測試**拿掉生產碼
  判斷也照樣會過**、錯誤路徑只驗 HTTP 狀態碼不驗回應主體。形式各異，本質相同：
  **測試全綠，而規則只被驗證了一部分。** **與本版已修的「條件式規則只列失敗分支」屬同一家族。**
  未處理的理由：比照加強制展開條款需先評估對場景數的影響（`OrderValidator` 有 5 條邊界規則，
  ×2 即多 5 個場景）—— 這正是「規則越加越多」的入口，該想清楚再動
- **條件式規則分支缺失並非普遍現象**：`OrderValidator` 出現、`EmployeeValidator` 未出現
  （後者在舊設計下即產出全部五個分支）。兩者表現不同的原因無定論，不作歸因
- **`Null` 與 `null` 大小寫混用**：tunit 產出同檔 6 : 4，兩者皆在白名單內、不違反規則，
  但檔內不一致，unit 側則一致使用小寫

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
