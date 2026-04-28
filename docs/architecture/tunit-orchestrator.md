# TUnit 測試 Orchestrator 架構說明

## 1. 概覽

TUnit 測試 Orchestrator 負責協調 TUnit 框架測試的工作流程，支援新建測試與從 xUnit 遷移兩種情境。

| 項目     | 說明                                       |
| -------- | ------------------------------------------ |
| 適用場景 | TUnit 框架測試（新建）、xUnit → TUnit 遷移 |
| 觸發指令 | `/dotnet-testing-orchestrator-tunit`       |
| 必要環境 | .NET SDK（不需要 Docker）                  |

Orchestrator 本身是 Skill（載入至 main thread context），透過 Agent tool 依序調度四個 subagent 完成測試生命週期。

---

## 2. TUnit 與 xUnit 的關鍵架構差異

| 面向           | xUnit                              | TUnit                                |
| -------------- | ---------------------------------- | ------------------------------------ |
| 架構           | 反射執行                           | Source Generator 產生程式碼          |
| 專案類型       | `<OutputType>Library</OutputType>` | `<OutputType>Exe</OutputType>`       |
| 執行指令       | `dotnet test`                      | `dotnet run`                         |
| 測試 Attribute | `[Fact]` / `[Theory]`              | `[Test]`                             |
| 參數化         | `[InlineData]` / `[MemberData]`    | `[Arguments]` / `[MethodDataSource]` |
| 設定/清理      | constructor / IDisposable          | `[Before(Test)]` / `[After(Test)]`   |
| 斷言           | `Assert.Equal`                     | `await Assert.That`                  |
| Test SDK       | `Microsoft.NET.Test.Sdk` 必要      | 不需要                               |

TUnit 透過 Source Generator 在編譯期產生測試執行程式碼，因此測試專案必須是可執行檔（`Exe`），而非傳統測試框架使用的類別庫（`Library`）。

---

## 3. 元件組成

| 元件         | 類型     | 路徑                                                       |
| ------------ | -------- | ---------------------------------------------------------- |
| Orchestrator | Skill    | `.claude/skills/dotnet-testing-orchestrator-tunit/`        |
| Analyzer     | Subagent | `.claude/agents/dotnet-testing-advanced-tunit-analyzer.md` |
| Writer       | Subagent | `.claude/agents/dotnet-testing-advanced-tunit-writer.md`   |
| Executor     | Subagent | `.claude/agents/dotnet-testing-advanced-tunit-executor.md` |
| Reviewer     | Subagent | `.claude/agents/dotnet-testing-advanced-tunit-reviewer.md` |

所有 subagent 透過 Agent tool 呼叫，由 Claude Code 自動載入各自的 `.claude/agents/*.md` 定義。

---

## 4. 使用的 Agent Skills

TUnit Orchestrator 管轄 2 個 Skills，由 Writer 依條件載入：

| Skill                | 載入條件 | 說明                                                                                                              |
| -------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `tunit-fundamentals` | 必載     | TUnit 基礎語法：`[Test]`、`[Arguments]`、`[Before/After(Test)]`、`await Assert.That`、`OutputType=Exe` 等核心規範 |
| `tunit-advanced`     | 條件載入 | 進階功能：Matrix 測試、DI 整合、`[NotInParallel]`、`[MethodDataSource]`、`[ClassDataSource]` 等                   |

`tunit-advanced` 的載入條件由 Analyzer 在分析階段判斷，透過 `tunitFeatureRequirements` 欄位傳遞給 Writer。觸發條件包含：decimal 參數、複雜參數組合、共享狀態、DI 需求等。

---

## 5. 工作流程細節

### Phase 0：前置清理

Orchestrator 啟動後，首先使用 Glob 檢查測試專案目錄下是否有殘留的 `.orchestrator/` 目錄（前次執行的中間產物）。若有，委託 Executor 以 `task: "cleanup"` 清理後再繼續。

### Phase 1 Analyzer

**工作內容：**

- 讀取被測試類別的完整原始碼
- 識別建構子依賴（需要哪些 interface / service）
- 識別所有公開方法（方法名、參數型別、回傳型別）
- 偵測目標類型（validator / service / repository 等）
- 進行框架偵測：判斷是新建測試，還是從 xUnit/NUnit 遷移的場景

**TUnit 特有的額外判斷：**

- 是否需要 `[MethodDataSource]`：當方法含有 `decimal` 型別參數，或測試資料複雜到無法用字面量表示時
- 是否需要 Matrix 測試：多維度參數組合
- 是否有共享狀態需要 `[NotInParallel]`
- 是否有 DI 整合需求（需要 `tunit-advanced`）

分析結果寫入交接檔案（`{testProjectDir}/.orchestrator/analysis/{ClassName}.analysis.json`），包含 `sourceCodeContext`（完整原始碼）、`requiredSkills`、`tunitFeatureRequirements`、`suggestedTestScenarios`（中文三段式命名）。

### Phase 2 Writer

**工作內容：**

Writer 讀取 Analyzer 交接檔案，依據 `requiredSkills` 載入對應的 Skills，產出符合 TUnit 規範的測試程式碼。

**TUnit 特定語法規範：**

- 所有測試方法必須是 `async Task`（不可用 `void` 或 `Task` 以外的型別）
- 優先使用 `[Arguments]` 進行參數化；`decimal` 等特殊型別改用 `[MethodDataSource]`
- 前置設定用 `[Before(Test)]`，後置清理用 `[After(Test)]`（不使用 constructor / IDisposable 模式）
- 斷言一律使用 `await Assert.That(actual).IsXxx(expected)`（非同步，不可省略 `await`）

**Writer 分割決策：**

當被測試目標規模較大時，Orchestrator 會將任務分割給多個 Writer 平行執行：

觸發條件（必須同時滿足所有條件）：

- `methodCount > 5` 或 `scenarioCount > 20`
- 且 `forbidWriterSplit != true`（Validator 類別永不分割）

分割策略：

1. 將各方法按 scenario 數量由多至少排序
2. 以貪婪演算法將方法分配至兩組，讓兩組的 scenario 總數盡量均衡
3. 兩個 Writer **平行**啟動，各自負責一組方法

Validator 類別（CrossField 規則與一般規則必須由同一個 Writer 處理）即使 scenarioCount 再大也永不分割。

### Phase 3 Executor

**工作內容：**

- 確認測試專案路徑（TUnit 測試專案可能在指定的版本子目錄下）
- 執行 `dotnet build`
- 執行 `dotnet run`（TUnit 推薦執行方式，不是 `dotnet test`）
- 若有建置或執行失敗，進行最多 3 輪的錯誤修正迴圈
- Source Generator 建置失敗時，可能需要 `dotnet clean` 後重新建置

**注意：**

`dotnet test` 在 TUnit 測試專案上也可執行，但官方推薦使用 `dotnet run` 以確保 Source Generator 產生的進入點正確執行。

### Phase 4 Reviewer（可選）

**執行條件：**

若 Executor 第一次執行就全數通過（修正迴圈為 0），且使用者未提出品質審查需求，Orchestrator 可直接跳過 Reviewer，進入結果整合。

**TUnit 特定審查重點：**

- 所有測試方法是否都是 `async Task`
- 是否有漏掉 `await` 的 `Assert.That` 呼叫
- xUnit 屬性零殘留驗證（遷移情境）：確認無 `[Fact]`、`[Theory]`、`[InlineData]`、`using Xunit;`
- 測試專案的 `OutputType` 是否正確設為 `Exe`
- `[MethodDataSource]` 的靜態方法是否存在且回傳型別正確

### Phase 5：後置清理

結果呈現完畢後，Orchestrator 委託 Executor 清理 `.orchestrator/` 目錄。

---

## 6. decimal 限制與 [MethodDataSource]

這是 TUnit 特有的重要限制，必須了解才能正確撰寫測試。

**問題根源：**

C# attribute 的參數只能使用常數運算式（constant expression）。`decimal` 型別的字面量（如 `1.5m`）不是常數運算式，因此無法直接作為 attribute 參數使用。

**錯誤用法（編譯失敗）：**

```csharp
[Test]
[Arguments(1.5m, 2.3m)]  // 編譯錯誤：decimal 不能作為 attribute 參數
public async Task Calculate_ValidInput_ReturnsExpected(decimal a, decimal b)
```

**正確做法：改用 [MethodDataSource]**

```csharp
public static IEnumerable<(decimal, decimal)> TestData()
{
    yield return (1.5m, 2.3m);
    yield return (0.0m, 0.0m);
    yield return (-1.5m, 2.3m);
}

[Test]
[MethodDataSource(nameof(TestData))]
public async Task Calculate_ValidInput_ReturnsExpected((decimal a, decimal b) data)
{
    var result = _sut.Calculate(data.a, data.b);
    await Assert.That(result).IsEqualTo(data.a + data.b);
}
```

**Analyzer 的判斷邏輯：**

當 Analyzer 偵測到方法含有 `decimal` 型別參數，會在 `tunitFeatureRequirements` 中標記需要 `[MethodDataSource]`，並觸發載入 `tunit-advanced` Skill，確保 Writer 產出正確的語法。

---

## 7. xUnit 遷移檢查清單

xUnit → TUnit 遷移完成後，Reviewer 執行零殘留驗證，確認以下所有項目均已清除：

- [ ] 無 `using Xunit;`
- [ ] 無 `[Fact]`、`[Theory]`、`[InlineData]`、`[MemberData]`
- [ ] 所有測試方法都是 `async Task`
- [ ] 所有斷言都有 `await`（`await Assert.That(...)`）
- [ ] 測試專案 `.csproj` 已移除 `Microsoft.NET.Test.Sdk` 參考
- [ ] `OutputType` 已從 `Library` 改為 `Exe`
- [ ] 建置成功，`dotnet run` 可正常執行

---

## 8. 交接機制與 Prompt 精簡原則

Orchestrator 在調度各 subagent 時，只傳遞交接檔案路徑與摘要數字，不嵌入完整 JSON 內容：

| 傳遞給 subagent 的資訊   | 說明                                           |
| ------------------------ | ---------------------------------------------- |
| `analysisFilePath`       | Analyzer 交接檔案路徑                          |
| `writerResultFilePath`   | Writer 交接檔案路徑                            |
| `executorResultFilePath` | Executor 交接檔案路徑                          |
| 摘要數字                 | `methodCount`、`scenarioCount`、`testCount` 等 |

各 subagent 在 Step 0 自行讀取交接檔案，取得所需的完整資訊（含 `sourceCodeContext`）。

---

## 9. 多目標執行策略

當使用者一次指定多個類別時：

| 階段             | 執行方式 | 原因                             |
| ---------------- | -------- | -------------------------------- |
| Phase 1 Analyzer | 平行     | 各目標獨立分析，無相互依賴       |
| Phase 2 Writer   | 平行     | 各目標獨立撰寫測試               |
| Phase 3 Executor | 循序     | 共用方案，依序建置與執行避免衝突 |
| Phase 4 Reviewer | 平行     | 各份測試獨立審查                 |

多 Writer 平行執行時，需在各 Writer prompt 中加入風格統一指令，確保兩個 Writer 產出的程式碼風格一致（斷言語法、命名慣例、lambda 形式等）。

---

## 10. 錯誤處理

| 錯誤情境                  | 處理方式                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Analyzer 找不到被測試類別 | 以 `Grep` 搜尋目標類別名稱，確認路徑後重新啟動                                                    |
| Source Generator 建置失敗 | 執行 `dotnet clean` 後重新建置                                                                    |
| Executor 3 輪後仍有失敗   | 區分「Source Generator 問題」、「TUnit 版本相容性問題」和「測試邏輯問題」，傳給 Reviewer 一併處理 |
| TUnit 版本鎖定衝突        | TUnit 0.6.123 與 Testing.Platform 版本鏈鎖需嚴格遵守，Executor 負責偵測並修正                     |
