# TUnit 測試 Orchestrator 架構說明

## 1. 概覽

TUnit 測試 Orchestrator 負責協調 TUnit 框架測試的工作流程，支援新增測試與從 xUnit／NUnit 遷移兩種情境。流程與單元測試 Orchestrator 相同，**只差在測試框架**。

| 項目     | 說明                                               |
| -------- | -------------------------------------------------- |
| 適用場景 | TUnit 框架測試（新增）、xUnit／NUnit → TUnit 遷移  |
| 觸發指令 | `/dotnet-testing-orchestrator-tunit`               |
| 必要環境 | .NET SDK（不需要 Docker）                          |

Orchestrator 本身是 Skill（載入至 main thread context），透過 Agent tool 依序調度四個 subagent 完成測試生命週期。

---

## 2. TUnit 與 xUnit 的關鍵差異

| 面向 | xUnit | TUnit |
| --- | --- | --- |
| 架構 | 反射執行 | Source Generator 產生程式碼 |
| 專案類型 | `<OutputType>Library</OutputType>` | `<OutputType>Exe</OutputType>` |
| 執行指令 | `dotnet test` | `dotnet run`（本流程禁用 `dotnet test`） |
| 測試 Attribute | `[Fact]` / `[Theory]` | `[Test]` |
| 參數化 | `[InlineData]` / `[MemberData]` | `[Arguments]` / `[MethodDataSource]` |
| 設定/清理 | constructor / IDisposable | `[Before(Test)]` / `[After(Test)]` |
| 方法簽章 | `void` 或 `Task` | 一律 `async Task` |
| Test SDK | `Microsoft.NET.Test.Sdk` 必要 | 不需要 |

斷言兩者相同，一律使用 AwesomeAssertions（`.Should()`）。

---

## 3. 元件組成

| 元件         | 類型     | 路徑                                                       |
| ------------ | -------- | ---------------------------------------------------------- |
| Orchestrator | Skill    | `.claude/skills/dotnet-testing-orchestrator-tunit/`        |
| Analyzer     | Subagent | `.claude/agents/dotnet-testing-advanced-tunit-analyzer.md` |
| Writer       | Subagent | `.claude/agents/dotnet-testing-advanced-tunit-writer.md`   |
| Executor     | Subagent | `.claude/agents/dotnet-testing-advanced-tunit-executor.md` |
| Reviewer     | Subagent | `.claude/agents/dotnet-testing-advanced-tunit-reviewer.md` |
| 規則檔       | 條件載入 | `.claude/agents/rules/tunit-writer-{validator,legacy}.md`  |

---

## 4. 使用的 Agent Skills

Writer 一律預載 `tunit-fundamentals`、`test-naming-conventions`、`unit-test-fundamentals`，其餘由 Writer 讀完被測目標後自行判斷是否載入：`tunit-advanced`（資料驅動、並行控制、Retry／Timeout、DI）、`nsubstitute-mocking`、`datetime-testing-timeprovider`、`filesystem-testing-abstractions`、`fluentvalidation-testing`、AutoFixture／Bogus 系列等。Analyzer 只描述事實（依賴、`tunitFeatureRequirements`），不指派 Skill。

xUnit 專用的 Skill（`xunit-project-setup`、`autodata-xunit-integration`、`test-output-logging`）與 `dotnet-test` 工具 Skill 不在 TUnit 流程的載入範圍內。

---

## 5. 工作流程細節

### Phase 0：前置清理

Orchestrator 啟動後，首先使用 Glob 檢查測試專案目錄下是否有殘留的 `.orchestrator/` 目錄。若有，委託 Executor 以 `task: "cleanup"` 清理後再繼續。

### 範圍契約

Orchestrator 依使用者指定的範圍建立一次 `requestedScope`（整個類別 `{ "kind": "class" }`，或指定方法 `{ "kind": "methods", "selectors": [...] }`），之後各階段只從交接檔讀取，不另外傳方法清單。使用者沒有提供被測試目標的檔案路徑時，Orchestrator 停下來詢問，不自行搜尋。

### Phase 1 Analyzer

- 讀取被測試類別的完整原始碼，識別目標類型（`service`／`validator`／`legacy`）
- 分析建構子依賴、方法簽章、例外與 guard pattern；IFileSystem／TimeProvider／複雜 Model 做深度分析
- 把被測類別明確宣告的每個 public 建構子列成測試情境（含只委派者），有 null guard 的參數各再加一個防禦情境
- **TUnit 專屬**：偵測測試專案目前的框架（新專案或遷移）、記錄測試專案的 TUnit 版本（`projectContext.tunitVersion`）、標記 `tunitFeatureRequirements` 與多維組合候選（`matrixCandidate`）
- 支援使用者貼上 `unit-test-scenarios` 格式的場景（採用模式）

分析結果寫入 `{testProjectDir}/.orchestrator/analysis/{ClassName}.analysis.json`。Orchestrator 讀回實體 JSON 驗證欄位後才啟動 Writer。

### Phase 2 Writer

一個被測類別固定啟動一個 Writer，產出一個測試檔案。規則分兩層：

- **契約層（不可偏離）**：TUnit 簽章（`[Test]`、`async Task`、`[Before(Test)]`）、AAA 標記、中文三段式命名、AwesomeAssertions、`#region` 分組、路徑跨平台、建構子場景全數落地
- **建議層（可偏離，理由記入 `deviations`）**：與單元測試 Writer 相同的九項預設做法

可用的 TUnit 功能以測試專案 `.csproj` 的實際版本為準。例如 `[Matrix]` 在 TUnit 0.x 不存在，多維組合改用 `[MethodDataSource]`。Writer 不自行建置或執行測試。

### Phase 3 Executor

- `dotnet restore --ignore-failed-sources`：還原失敗即停止並回報，不進修正迴圈
- `dotnet build`：以測試專案為單位建置，**不抑制警告**
- `dotnet run --no-build`：TUnit 原生執行；**`dotnet test` 禁用**（會讓 Source Generator 行為失真、誤報失敗）
- 最多 3 輪修正迴圈；Source Generator 相關錯誤先 `dotnet clean` 再建置
- 每道實際執行的指令與 exit code 記入 `commandExecutions`
- **不修改 `src/`**：根因在生產程式碼時保留測試失敗、記入 `productionObservations[]`，由使用者決定

### Phase 4 Reviewer

Reviewer **一律執行**，先讀 executor-result 判定前提：`buildResult` 不是 `success` 時不給評分（`upstream-build-blocked`）；測試有失敗時照常審查，但結論不得呈現為通過。

審查分三段：① 契約檢核（含 TUnit 合規性：`[Test]`、`async Task`、`OutputType=Exe`、無 `Microsoft.NET.Test.Sdk`、無 xUnit 殘留）、② `deviations` 偏離審查、③ 風險導向審查（覆蓋、建構子、Mock、資料驅動、並行控制、Validator 規則、遷移正確性）。評分為 A+～D。

Reviewer 回傳後，Orchestrator 呈現完整報告並**等待使用者指示**再決定是否啟動修改流程（Writer 修改模式 → Executor → Reviewer re-review 模式）。

### Phase 5：後置清理

四階段全部完成、Token 用量表貼出後，Orchestrator 委託 Executor 清理整個 `.orchestrator/` 目錄，並輸出狀態行作為回覆的最後一行。

---

## 6. decimal 與 [Arguments]

C# attribute 的參數只能使用常數運算式，`decimal` 不是 attribute 常數型別，`[Arguments(1.5m)]` 會編譯失敗。`decimal` 參數改用 `[MethodDataSource]` 提供：

```csharp
public static IEnumerable<(decimal Price, decimal Expected)> DiscountCases()
{
    yield return (100m, 90m);
    yield return (0m, 0m);
}

[Test]
[MethodDataSource(nameof(DiscountCases))]
public async Task ApplyDiscount_依原價計算_應回傳折扣後價格((decimal Price, decimal Expected) data)
{
    // Arrange
    var sut = new PriceCalculator();

    // Act
    var result = sut.ApplyDiscount(data.Price);

    // Assert
    result.Should().Be(data.Expected);
    await Task.CompletedTask;
}
```

---

## 7. xUnit 遷移檢查清單

遷移完成後，Reviewer 確認以下項目：

- [ ] 無 `using Xunit;`
- [ ] 無 `[Fact]`、`[Theory]`、`[InlineData]`、`[MemberData]`
- [ ] 所有測試方法都是 `async Task`
- [ ] 建構子／`IDisposable` 已改為 `[Before(Test)]`／`[After(Test)]`
- [ ] 測試專案 `.csproj` 已移除 `Microsoft.NET.Test.Sdk`，`OutputType` 為 `Exe`
- [ ] 建置成功，`dotnet run` 可正常執行

---

## 8. 交接機制

Orchestrator 在調度各 subagent 時只傳遞交接檔案路徑，不嵌入 JSON 內容；各 subagent 在 Step 0 自行讀取。每個階段之間，Orchestrator 讀回實體 JSON 驗證欄位（場景數與 `methodScenarioCounts` 一致、`methodsCovered` 為明確方法清單、`executionMethod` 為 `dotnet run`、`fixRounds` 與 `fixHistory` 一致等），不只採信 subagent 的回傳摘要。

| 交接檔案 | 產出者 | 主要內容 |
| --- | --- | --- |
| `analysis/{ClassName}.analysis.json` | Analyzer | `requestedScope`、`methodsToTest`、`suggestedTestScenarios`、`methodScenarioCounts`、`dependencies`、`tunitFeatureRequirements`、`projectContext` |
| `writer-result/{ClassName}.writer-result.json` | Writer | `testFilePaths`、`testCaseCount`、`testClasses`、`skillsLoaded`、`deviations`、`nugetChanges` |
| `executor-result/{ClassName}.executor-result.json` | Executor | `executionMethod`、`buildResult`、`testResult`、測試數、`fixHistory`、`commandExecutions`、`productionObservations` |

---

## 9. 多目標執行策略

| 階段 | 執行方式 | 原因 |
| --- | --- | --- |
| Phase 1 Analyzer | 平行 | 各目標獨立分析 |
| Phase 2 Writer | 平行 | 各目標獨立撰寫測試 |
| Phase 3 Executor | 循序 | 同專案建置不可並行；以 `--treenode-filter` 各自對帳 |
| Phase 4 Reviewer | 平行 | 各份測試獨立審查 |

---

## 10. 錯誤處理

| 錯誤情境 | 處理方式 |
| --- | --- |
| Analyzer 找不到被測試類別 | 向使用者確認正確路徑後重新啟動，不自行搜尋替代目標 |
| NuGet 還原失敗 | Executor 停止並回報，不進修正迴圈 |
| Source Generator 建置失敗 | 執行 `dotnet clean` 後重新建置 |
| Executor 3 輪後仍有失敗 | Reviewer 照常執行；結果中區分 TUnit 設定、版本相容性、測試邏輯、生產程式碼問題 |
