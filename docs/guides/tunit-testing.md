# TUnit 測試工作流程使用指南

TUnit 是新世代 .NET 測試框架，與 xUnit 有根本架構差異：TUnit 透過 **Roslyn Source Generator** 在編譯時產生測試發現程式碼，測試專案必須設定 `OutputType = Exe`，執行指令為 `dotnet run`（而非 `dotnet test`），並採用 **async-first 設計**（所有測試方法必須是 `async Task`）。TUnit 也支援 AOT 編譯，不依賴執行期反射。

本工作流程適用於兩種場景：

- **新增 TUnit 測試**：為現有 .NET 類別建立 TUnit 測試
- **xUnit → TUnit 遷移**：將現有 xUnit 測試轉換為 TUnit 語法，並補充新測試

---

## A. 前提條件

- Claude Code CLI 已安裝
- `dotnet-testing-agent-skills` 已安裝（提供 TUnit Analyzer / Writer / Executor / Reviewer 四個 subagent）
- .NET SDK 8.0 / 9.0 / 10.0（至少一個版本）
- **不需要 Docker Desktop**
- TUnit 測試專案必須設定 `OutputType = Exe`

> TUnit 使用 Source Generator 在編譯時產生 Main 進入點，因此測試專案必須是可執行檔而非類別庫。

---

## B. 指令與使用範例

### 基本指令

```text
/dotnet-testing-orchestrator-tunit
```

### xUnit vs TUnit 快速對照

| xUnit | TUnit | 說明 |
|-------|-------|------|
| `[Fact]` | `[Test]` | 無參數測試 |
| `[Theory]` + `[InlineData]` | `[Test]` + `[Arguments]` | 參數化測試 |
| `[MemberData]` | `[MethodDataSource]` | 方法資料來源 |
| `constructor` | `[Before(Test)]` | 測試前置設定 |
| `IDisposable.Dispose` | `[After(Test)]` | 測試後置清理 |
| `Assert.Equal(expected, actual)` | `await Assert.That(actual).IsEqualTo(expected)` | 斷言語法（TUnit 是 async） |
| `dotnet test` | `dotnet run` | 執行方式 |

### 使用範例

#### 情境 1：純函式類別測試（[Arguments] 參數化）

```text
/dotnet-testing-orchestrator-tunit

目標：samples/tunit/practice_tunit/src/Practice.TUnit.Core/Services/BookCatalog.cs
說明：純函式書籍目錄類別（6 個靜態方法：IsValidIsbn13、CalculateDiscountPrice、
      CalculateOverdueFine、ClassifyByPageCount、GenerateIndexCode、IsClassic），
      使用 [Test] + [Arguments] 參數化測試
測試專案：samples/tunit/practice_tunit/tests/Practice.TUnit.Core.Tests/Practice.TUnit.Core.Tests.csproj
```

**預期結果**：60 個測試全數通過（28 個方法展開為 60 個案例）

**適用時機**：被測類別為純函式（無外部依賴）、參數為基本型別（非 decimal）

#### 情境 2：有 Mock 依賴的服務（[MethodDataSource]）

```text
/dotnet-testing-orchestrator-tunit

目標：samples/tunit/practice_tunit/src/Practice.TUnit.Core/Services/LibraryMemberService.cs
說明：依賴 IMemberRepository、ILoanRepository、INotificationService，
      需要 Mock 依賴、[MethodDataSource] 資料來源
測試專案：samples/tunit/practice_tunit/tests/Practice.TUnit.Core.Tests/Practice.TUnit.Core.Tests.csproj
```

**[MethodDataSource] 的使用時機**：

- 測試參數包含 `decimal` 型別（`[Arguments]` 不支援 decimal literal）
- 測試資料結構複雜，需要強型別 record 或多欄位組合
- 需要共用測試資料集（多個測試方法重用同一資料源）

#### 情境 3：多目標類別平行處理

```text
/dotnet-testing-orchestrator-tunit

目標：LibraryMemberService 和 ReservationService
被測試目標：
  samples/tunit/practice_tunit/src/Practice.TUnit.Core/Services/LibraryMemberService.cs
  samples/tunit/practice_tunit/src/Practice.TUnit.Core/Services/ReservationService.cs
測試專案：samples/tunit/practice_tunit/tests/Practice.TUnit.Core.Tests/Practice.TUnit.Core.Tests.csproj
說明：兩個 Service 需各自獨立測試類別，驗證平行委派能力
```

**Orchestrator 的處理策略**：Analyzer x2 平行、Writer x2 平行，Executor x1 循序（共用測試專案），Reviewer x2 平行。預期 76 個測試全數通過。

#### 情境 4：xUnit 遷移情境

```text
/dotnet-testing-orchestrator-tunit

目標：CatalogExportService（含 xUnit → TUnit 遷移）
遷移來源：samples/tunit/practice_tunit/migration_source/BookCatalogXunitTests.cs
          （12 個 xUnit 測試，含 Fact/Theory/InlineData/MemberData/IDisposable）
被測試目標：samples/tunit/practice_tunit/src/Practice.TUnit.Core/Services/CatalogExportService.cs
測試專案：samples/tunit/practice_tunit/tests/Practice.TUnit.Core.Tests/Practice.TUnit.Core.Tests.csproj
說明：將現有 xUnit 測試遷移到 TUnit 框架，並為 CatalogExportService 補充新測試
驗證：遷移後確認無殘留 xUnit 屬性（[Fact]、[Theory]、[InlineData]、using Xunit 等）
```

**Reviewer 會執行零殘留驗證**，確認以下項目全數為 0：`[Fact]`、`[Theory]`、`[InlineData]`、`[MemberData]`、`ITestOutputHelper`、`using Xunit;`

---

## C. 練習專案

### 目錄結構

練習專案位於 `samples/tunit/practice_tunit/`，以圖書館管理系統為主題：

```text
practice_tunit/
├── Practice.TUnit.slnx
├── migration_source/                  # P3-5 xUnit → TUnit 遷移來源
│   └── BookCatalogXunitTests.cs
├── src/
│   └── Practice.TUnit.Core/
│       ├── Models/
│       ├── Interfaces/
│       └── Services/
└── tests/
    └── Practice.TUnit.Core.Tests/     # OutputType = Exe（由 Orchestrator 產生測試）
```

測試專案採用 `OutputType = Exe`，不使用 `Microsoft.NET.Test.Sdk`。

### 各 Phase 說明

| Phase | 目標類別 | 學習重點 |
|-------|---------|---------|
| P3-1 | `BookCatalog` | `[Test]` + `[Arguments]` 純函式測試 |
| P3-2 | `LibraryMemberService` | Mock、`[MethodDataSource]`、`[Matrix]` |
| P3-3 | `LoanService` | 狀態轉換（借閱/歸還/續借）、`dotnet run` 執行驗證 |
| P3-4 | `ReservationService` | TimeProvider、Reviewer 合規性審查 |
| P3-5 | `CatalogExportService` | IFileSystem、xUnit → TUnit 遷移 |

### 還原測試專案

測試 subagent 工作流程後，執行以下指令還原測試專案至初始狀態：

```bash
git checkout -- samples/tunit/practice_tunit/tests/
```

---

## D. 常見問題排查

**1. dotnet run 找不到可執行檔**

症狀：Executor 執行 `dotnet run` 時出現找不到可執行檔的錯誤

可能原因：測試專案未設定 `OutputType = Exe`

解法：確認 .csproj 中有下列設定：

```xml
<OutputType>Exe</OutputType>
```

---

**2. Source Generator 未產生程式碼**

症狀：建置成功但測試沒有執行，或看不到測試類別

可能原因：TUnit Source Generator 的 Roslyn Analyzer 未正確啟動

解法：確認 TUnit NuGet 套件版本正確，嘗試 `dotnet clean` 後重新建置

---

**3. decimal 在 [Arguments] 中的限制**

症狀：使用 `[Arguments(1.5m)]` 時出現編譯錯誤

說明：TUnit 的 `[Arguments]` attribute 不支援 `decimal` 字面量，這是 C# attribute 本身的語言限制

解法：改用 `[MethodDataSource]` 透過方法提供測試資料：

```csharp
// 錯誤：[Arguments] 不支援 decimal
[Test]
[Arguments(29.99m, 0.1m)]  // 編譯錯誤
public async Task CalculateDiscount_折扣價格_應正確計算(decimal price, decimal rate) { }

// 正確：改用 [MethodDataSource]
[Test]
[MethodDataSource(nameof(DiscountTestData))]
public async Task CalculateDiscount_折扣價格_應正確計算(decimal price, decimal rate) { }

public static IEnumerable<(decimal, decimal)> DiscountTestData()
{
    yield return (29.99m, 0.1m);
    yield return (100.00m, 0.2m);
}
```

---

**4. 遷移後殘留 xUnit 屬性**

症狀：遷移後仍有 `[Fact]`、`[Theory]`、`[InlineData]` 等 xUnit 屬性在程式碼中

說明：Reviewer 會執行零殘留驗證並回報殘留數量，但如果仍有殘留需手動修正

解法：搜尋以下關鍵字確認是否有遺漏：

```bash
# 搜尋 xUnit 殘留
grep -rn "\[Fact\]\|\[Theory\]\|\[InlineData\]\|using Xunit" samples/tunit/practice_tunit/tests/
```

---

**5. 非同步斷言語法錯誤**

症狀：忘記 `await` 導致斷言沒有實際執行（測試永遠通過，但邏輯未驗證）

說明：TUnit 的 `Assert.That` 是非同步 API，必須搭配 `await`

解法：確認所有 `Assert.That` 前都有 `await`：

```csharp
// 錯誤：缺少 await，斷言不會執行
Assert.That(result).IsEqualTo(expected);

// 正確：加上 await
await Assert.That(result).IsEqualTo(expected);
```

---

## E. 工作流程細節

### TUnit 與 xUnit 的核心架構差異

TUnit 的架構完全不同於 xUnit：

1. **Source Generator 架構**：TUnit 透過 Roslyn Source Generator 在編譯時產生測試執行程式碼，不依賴執行期反射
2. **OutputType = Exe**：測試專案必須是可執行檔（非 Library），因為 TUnit 的 Source Generator 會產生 `Main` 進入點
3. **dotnet run 執行**：必須用 `dotnet run` 而非 `dotnet test` 執行測試
4. **async-first 設計**：所有測試方法都是 `async Task`，斷言也是非同步的（`await Assert.That(...)`）

TUnit 測試專案的 .csproj 結構：

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net9.0</TargetFramework>
    <OutputType>Exe</OutputType>           <!-- 必須是 Exe -->
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="TUnit" Version="0.6.123" />
    <!-- 不需要 Microsoft.NET.Test.Sdk -->
  </ItemGroup>
</Project>
```

### Phase 1：Analyzer 分析

TUnit Analyzer 與單元測試 Analyzer 的差異：

- 額外判斷是否需要 `[MethodDataSource]`（decimal 型別或複雜測試資料結構）
- 評估是否是 xUnit → TUnit 遷移情境（偵測 `[Fact]`、`[Theory]`、`IDisposable` 等遷移源）
- 判斷需要載入的 TUnit Skills 組合：`tunit-fundamentals`（必載）+ `tunit-advanced`（條件載入）

| 需要載入 tunit-advanced 的情況 | 說明 |
|-------------------------------|------|
| 有 `[MethodDataSource]` 需求 | 複雜資料驅動測試或 decimal 參數 |
| 有 DI 整合需求 | `[ClassDataSource]`、屬性注入 |
| 有 WebApplicationFactory 整合 | TUnit 整合測試 |
| 有 Retry / Timeout 需求 | `[Retry]`、`[Timeout]` 控制 |

### Phase 2：Writer 撰寫

TUnit Writer 的特殊行為：

- 所有測試方法都是 `async Task`
- 使用 `[Test]` 而非 `[Fact]`/`[Theory]`
- 參數化測試優先使用 `[Arguments]`；decimal 等特殊型別改用 `[MethodDataSource]`
- 前置設定用 `[Before(Test)]` 而非 constructor；後置清理用 `[After(Test)]` 而非 `IDisposable`
- **Writer 啟動**：一個被測類別固定一個 Writer、一個測試檔案，不論規模都不拆分

### Phase 3：Executor 建置與執行

TUnit Executor 的特殊行為：

- **執行指令是 `dotnet run` 而非 `dotnet test`**
- 需先確認測試專案路徑（`OutputType = Exe` 的 .csproj）
- Source Generator 在首次建置時可能需要額外時間（Roslyn Analyzer 啟動）

執行範例：

```bash
dotnet run --project tests/Practice.TUnit.Core.Tests/Practice.TUnit.Core.Tests.csproj
```

### Phase 4：Reviewer 審查（可選）

若 Executor 第一次執行就全數通過（無修正迴圈），且使用者未要求品質審查，可跳過 Reviewer。

TUnit 特定審查項目：

- 是否所有測試都是 `async Task`（非 `void` 或 `Task`）
- 是否有忘記 `await` 的 `Assert.That`
- xUnit 屬性是否完全移除（零殘留驗證）
- `.csproj` 的 `OutputType` 是否正確設定為 `Exe`
- 生命週期是否正確：`[Before(Test)]`/`[After(Test)]` 是否正確替代建構子/`IDisposable`
- **被測類別**的每個明確宣告 public 建構子是否都有對應測試（與上一項無關——上一項講的是測試類別的生命週期，這一項講的是被測類別的建構子）
- 測試命名是否遵循中文三段式格式（`方法名_情境描述_預期結果`）
