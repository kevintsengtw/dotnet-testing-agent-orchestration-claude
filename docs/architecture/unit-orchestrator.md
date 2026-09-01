# 單元測試 Orchestrator 架構說明

## 1. 概覽

| 項目                    | 說明                                                       |
| ----------------------- | ---------------------------------------------------------- |
| 適用場景                | xUnit 單一類別單元測試（Service / Validator / Legacy）     |
| Orchestrator Skill 路徑 | `.claude/skills/dotnet-testing-orchestrator-unit/SKILL.md` |
| 觸發指令                | `/dotnet-testing-orchestrator-unit`                        |

Orchestrator 本身是一個**指揮中心**，負責調度四個 Subagent，不直接撰寫任何測試程式碼。整個流程從 Phase 0 前置清理開始，依序經過 Analyzer → Writer → Executor → Reviewer 四個核心階段，最終以 Phase 5 後置清理收尾。

---

## 2. 元件組成

| 元件         | 類型     | 路徑                                               |
| ------------ | -------- | -------------------------------------------------- |
| Orchestrator | Skill    | `.claude/skills/dotnet-testing-orchestrator-unit/` |
| Analyzer     | Subagent | `.claude/agents/dotnet-testing-analyzer.md`        |
| Writer       | Subagent | `.claude/agents/dotnet-testing-writer.md`          |
| Executor     | Subagent | `.claude/agents/dotnet-testing-executor.md`        |
| Reviewer     | Subagent | `.claude/agents/dotnet-testing-reviewer.md`        |

各 Subagent 的輸入規格定義在各自 Agent 定義檔的「輸入契約（Input Contract）」段落中。Orchestrator 只需按契約傳入對應參數即可，無需了解 Subagent 的內部實作。

---

## 3. 使用的 Agent Skills

Writer Subagent 依照 Analyzer 的分析報告，動態載入所需的 Agent Skills。以下為完整的 Skills 分類清單：

| 分類      | Agent Skills                                         |
| --------- | ---------------------------------------------------- |
| 核心框架  | `dotnet-testing-xunit`（xUnit 基礎架構）             |
| Mock 框架 | `dotnet-testing-nsubstitute`                         |
| 測試資料  | `dotnet-testing-autofixture`、`dotnet-testing-bogus` |
| 時間抽象  | `dotnet-testing-faketimeprovider`                    |
| 檔案系統  | `dotnet-testing-mockfilesystem`                      |
| 驗證器    | `dotnet-testing-fluentvalidation`                    |
| 斷言      | `dotnet-testing-awesomeassertions`                   |

> Agent Skills 由外部 repo [`dotnet-testing-agent-skills`](https://github.com/kevintsengtw/dotnet-testing-agent-skills) 提供，需另行安裝後才可供 Writer 載入。

---

## 4. 工作流程細節

### Phase 0：前置清理

Orchestrator 在啟動 Analyzer 之前，先以 Glob 檢查測試專案目錄下是否存在殘留的 `.orchestrator/` 暫存目錄：

- **有殘留**：委託 Executor 以 `task: "cleanup"` 模式清理後，再進入階段 1。
- **無殘留**：直接進入階段 1。

### Phase 1 Analyzer

Analyzer 讀取被測試目標的原始碼，識別類別類型與依賴，產出結構化的分析 JSON 報告（交接檔案）。

**三種目標類別類型：**

| 類型                 | 特徵                                                          | 特殊處理                                |
| -------------------- | ------------------------------------------------------------- | --------------------------------------- |
| Service（服務類別）  | 有外部依賴（Repository、DbContext、HttpClient 等），需要 Mock | 正常流程                                |
| Validator（驗證器）  | 繼承 `AbstractValidator<T>`，使用 FluentValidation            | 條件載入 `.claude/agents/rules/unit-writer-validator.md` 的專屬規則 |
| Legacy（遺留程式碼） | 靜態依賴、難以測試的設計（靜態方法、直接 `new` 相依物件）     | 需要特殊包裝策略                        |

**Analyzer 輸出摘要（回傳給 Orchestrator 的欄位）：**

- `className`、`targetType`、`methodCount`、`scenarioCount`、`methodScenarioCounts`
- `analysisFilePath`：實際寫入的交接檔案路徑
- `projectContext`：目標框架版本（`net8.0` / `net9.0` / `net10.0`）

Orchestrator 收到摘要後，使用 Glob 驗證交接檔案是否確實存在，再啟動 Writer。

### Phase 2 Writer

Writer 在 Step 0 讀取 Analyzer 的交接 JSON，按需載入對應的 Agent Skills，然後撰寫完整的測試程式碼。

**測試命名慣例：**

採用中文三段式格式：`方法名_情境描述_預期結果`

範例：`CreateAsync_商品名稱已存在_應擲回DuplicateNameException`

**Writer 啟動規則：**

**一個被測類別固定啟動一個 Writer，產出一個 `{ClassName}Tests.cs`。** 不論方法數或情境數多寡，都不拆分。

早期版本會在 `methodCount > 5` 或 `scenarioCount > 20` 時拆為兩個平行 Writer。實測顯示平行 Writer 之間無法協調預設值與寫法，跨檔案必然漂移，且每次漂移的面向都不同：補一條規則就換一個地方漂。改為單一檔案後此類問題整體消失。

**Skill 取用：**

Writer 預載三項基礎 Skill（`unit-test-fundamentals`、`test-naming-conventions`、`xunit-project-setup`），其餘 16 個以目錄形式提供，由 Writer 讀完被測目標原始碼後自行決定要不要讀。Analyzer 不再產出 `requiredTechniques` 指派清單。

實際讀取了哪些記於交接檔案的 `skillsConsulted`。

**斷言規範：**

- 必須使用 AwesomeAssertions（`result.Should().Be(...)`）。
- 禁止使用 xUnit 內建的 `Assert.Equal` 等斷言方法。

**規則分層：**

契約層（不可偏離）：AAA 標記、中文三段式命名、AwesomeAssertions、`#region` 分組、路徑跨平台。

建議層（可依判斷偏離）：測試資料建構策略、物件比對方式、邊界值標註、`[InlineData]` 展開策略、例外斷言寫法等。偏離時必須在交接檔案的 `deviations` 記錄理由，由 Reviewer 逐筆審查。理由成立不算缺失，未記錄才算。

### Phase 3 Executor

Executor 負責建置並執行測試，同時處理編譯錯誤修正。

**建置策略：**

- 優先建置測試專案的 `.csproj`（含所有間接依賴的 csproj 一起建置）。
- 建置成功後執行 `dotnet test`。

**錯誤修正迴圈：**

- 最多修正 3 輪，超過則回報失敗並帶入 Reviewer 階段標示問題。
- 常見修正項目：缺少 `using` 宣告、NuGet 套件版本不符、型別名稱不存在或拼寫錯誤。

**Executor 輸出摘要：**

- `totalTests`、`passedTests`、`failedTests`、`fixRounds`、`executorResultFilePath`

### Phase 4 Reviewer

Reviewer 讀取測試程式碼與三個交接檔案（Analyzer / Writer / Executor 的結果），進行品質審查。

**審查項目：**

| 審查面向    | 具體檢查內容                                                         |
| ----------- | -------------------------------------------------------------------- |
| 命名規範    | 是否符合中文三段式格式（`方法名_情境描述_預期結果`）                 |
| 斷言風格    | 是否使用 AwesomeAssertions，禁止 `Assert.Equal` 等 xUnit 內建斷言    |
| 測試隔離    | 每個測試方法是否只驗證一個行為                                       |
| Mock 設定   | NSubstitute 的 Substitute 設定是否正確，是否有多餘的 Received() 驗證 |
| AutoFixture | 初始化方式是否一致（`IFixture` 欄位、OmitOnRecursionBehavior）       |
| 覆蓋率      | 是否遺漏重要的邊界情境（null 輸入、空集合、例外路徑等）              |

**修正流程：**

Reviewer 回傳結果後，Orchestrator 呈現完整報告（`overallScore`、`issues`、`missingTestCases`），並**等待使用者指示**再決定是否啟動修改流程。修改流程為三階段：Writer（修改模式）→ Executor → Reviewer（re-review 模式）。

### Phase 5：後置清理

四階段全部完成並向使用者呈現結果後，Orchestrator 使用 Bash 清理 Executor 的暫存結果目錄：

```bash
rm -rf "{testProjectDir}/.orchestrator/executor-result/"
```

> `.orchestrator/analysis/` 目錄保留不刪，供外部量測工具（如 `benchmark-token.ps1`）讀取 analysis.json 的大小。下一次執行時，Phase 0 前置清理會處理殘留。

---

## 5. 支援的測試技術組合

```text
xUnit 2.9+
NSubstitute 5.x
AutoFixture 4.x
AwesomeAssertions（基於 FluentAssertions）
Bogus
Microsoft.Extensions.TimeProvider.Testing（FakeTimeProvider）
TestableIO.System.IO.Abstractions.TestingHelpers（MockFileSystem）
```

---

## 6. 交接檔案機制

Subagent 之間透過 JSON 交接檔案傳遞分析結果，避免在 prompt 中嵌入大量內容：

| 交接檔案                           | 寫入者   | 路徑格式                                          |
| ---------------------------------- | -------- | ------------------------------------------------- |
| `{ClassName}.analysis.json`        | Analyzer | `{testProjectDir}/.orchestrator/analysis/`        |
| `{ClassName}.writer-result.json`   | Writer   | `{testProjectDir}/.orchestrator/`                 |
| `{ClassName}.executor-result.json` | Executor | `{testProjectDir}/.orchestrator/executor-result/` |

Orchestrator 在呼叫各 Subagent 時只傳入交接檔案路徑與摘要數字，不嵌入完整 JSON 內容。每個 Subagent 的 Step 0 會自行讀取上游交接檔案取得完整資訊。

---

## 7. 多目標並行策略

使用者可一次指定多個被測試類別，Orchestrator 採用以下並行策略：

| 階段             | 執行方式 | 原因                               |
| ---------------- | -------- | ---------------------------------- |
| Phase 1 Analyzer | 平行     | 每個目標互不依賴                   |
| Phase 2 Writer   | 平行     | 每個目標獨立撰寫                   |
| Phase 3 Executor | 循序     | 同一專案的 `dotnet build` 不可並行 |
| Phase 4 Reviewer | 平行     | 每份測試獨立審查                   |
