# Aspire 測試工作流程使用指南

本文件說明如何使用 `dotnet-testing-orchestrator-aspire` 為 .NET Aspire 分散式應用自動產生整合測試。Orchestrator 分析 AppHost 的 Resource 結構，使用 `DistributedApplicationTestingBuilder` 建立測試，由 Aspire 宣告式管理所有 Container。

觸發指令：`/dotnet-testing-orchestrator-aspire`

執行時間預期：**8-16 分鐘**（包含 Container 啟動時間，請有耐心等待）。

---

## A. 前提條件

- Claude Code CLI 已安裝
- `dotnet-testing-agent-skills` 已安裝（外部 repo，需另行安裝）
- .NET SDK 8.0 / 9.0 / 10.0（至少一個版本）
- **Docker Desktop 必須執行中**（Aspire Container 編排需要）
- **.NET Aspire workload 已安裝**

```bash
dotnet workload install aspire
dotnet workload list  # 確認 aspire 已列出
```

- **執行時間預期：8-16 分鐘**（包含 SQL Server、Redis 等 Container 啟動時間，請有耐心等待）

---

## B. 指令與使用範例

### 基本指令

```text
/dotnet-testing-orchestrator-aspire
```

### 情境 1：基本 CRUD 整合測試

為 BookingsController 的基本 CRUD 操作建立 Aspire 整合測試，涵蓋 Happy Path 與錯誤路徑。

```text
/dotnet-testing-orchestrator-aspire 為 BookingsController 撰寫 Aspire 整合測試。
被測試 API：samples/aspire/practice_aspire/src/Practice.Aspire.WebApi
AppHost：samples/aspire/practice_aspire/src/Practice.Aspire.AppHost
測試專案：samples/aspire/practice_aspire/tests/Practice.Aspire.AppHost.Tests/Practice.Aspire.AppHost.Tests.csproj
BookingsController 有 9 個端點（CRUD + Confirm/CheckIn/Cancel 狀態轉換 + ByStatus 查詢），使用 SQL Server（BookingsDb）+ Redis（cache）。需涵蓋 Happy Path 與錯誤路徑（FluentValidation 400、404）。
```

Orchestrator 預期行為：

- Analyzer 讀取 AppHost Program.cs，識別 `sql`、`BookingsDb`、`cache`、`bookingapi` 四項 Resource 拓撲
- Writer 建立 `AspireAppFixture`（使用 `DistributedApplicationTestingBuilder`）、`TestBase`（繼承 `IClassFixture<AspireAppFixture>`）和依 HTTP 狀態碼分類的測試類別
- Executor 啟動分散式應用（真正拉起 SQL Server + Redis Container）進行建置與測試

### 情境 2：狀態轉換測試（Confirm / CheckIn / Cancel）

聚焦三個狀態轉換端點，涵蓋合法轉換、非法轉換（409 Conflict）和不存在的預約（404）。

```text
/dotnet-testing-orchestrator-aspire 為 BookingsController 的狀態轉換端點補充 Aspire 整合測試。
被測試 API：samples/aspire/practice_aspire/src/Practice.Aspire.WebApi
AppHost：samples/aspire/practice_aspire/src/Practice.Aspire.AppHost
測試專案：samples/aspire/practice_aspire/tests/Practice.Aspire.AppHost.Tests/Practice.Aspire.AppHost.Tests.csproj
聚焦三個狀態轉換端點：Confirm（Pending→Confirmed）、CheckIn（Confirmed→CheckedIn）、Cancel（禁止從 CheckedOut/Cancelled 取消）。需涵蓋合法轉換、非法轉換（409 Conflict）、不存在的預約（404）等完整路徑。
```

Orchestrator 預期行為：

- Analyzer 識別狀態機路徑（合法轉換 + 非法轉換）
- Writer 建立 `BookingsConflictTests.cs`，含 409 Conflict 的 ProblemDetails 驗證
- Executor 驗證狀態轉換端點在真實 Aspire 環境中的行為

### 情境 3：完整覆蓋（所有端點）

一次涵蓋所有 9 個端點的 Happy Path 與錯誤路徑。

```text
/dotnet-testing-orchestrator-aspire 為 BookingsController 撰寫完整的 Aspire 整合測試，涵蓋所有 9 個端點的 Happy Path 與錯誤路徑。
被測試 API：samples/aspire/practice_aspire/src/Practice.Aspire.WebApi
AppHost：samples/aspire/practice_aspire/src/Practice.Aspire.AppHost
測試專案：samples/aspire/practice_aspire/tests/Practice.Aspire.AppHost.Tests/Practice.Aspire.AppHost.Tests.csproj
系統使用 SQL Server（BookingsDb）+ Redis（cache），需涵蓋：CRUD 操作、FluentValidation 驗證（400）、資源不存在（404）、狀態轉換完整路徑（Confirm/CheckIn/Cancel 的合法與非法轉換 409）、ByStatus 查詢過濾。
```

Orchestrator 預期行為：

- 四個 subagent 完整執行（Analyzer → Writer → Executor → Reviewer）
- Writer 產出 HappyPath、Validation、NotFound、Conflict、E2ETests 五種測試類別
- Executor 首次建置零錯誤，所有測試通過

---

## C. 練習專案

### 目錄結構

練習專案位於 `samples/aspire/practice_aspire/`，是供 Orchestrator 驗證的空白起點。

```plaintext
practice_aspire/
├── Practice.Aspire.slnx
├── README.md
├── src/
│   ├── Practice.Aspire.AppHost/         # Aspire AppHost（編排中心）
│   │   ├── Practice.Aspire.AppHost.csproj
│   │   └── Program.cs                   # Resource 定義
│   └── Practice.Aspire.WebApi/          # 被編排的 WebAPI 專案
│       ├── Controllers/
│       │   └── BookingsController.cs    # 預約 CRUD + 狀態轉換 API
│       ├── Data/
│       ├── Models/
│       └── Validators/
└── tests/
    └── Practice.Aspire.AppHost.Tests/   # 測試專案（由 Orchestrator 填充）
        └── Practice.Aspire.AppHost.Tests.csproj
```

### AppHost Resource 拓撲

`Practice.Aspire.AppHost` 宣告以下四項 Resource：

| Resource 名稱 | 類型       | 方法                                                        | 說明       |
| ------------- | ---------- | ----------------------------------------------------------- | ---------- |
| `sql`         | SQL Server | `AddSqlServer("sql")`                                       | 資料庫容器 |
| `BookingsDb`  | Database   | `sqlServer.AddDatabase("BookingsDb")`                       | 訂房資料庫 |
| `cache`       | Redis      | `AddRedis("cache")`                                         | 快取容器   |
| `bookingapi`  | Project    | `AddProject<Projects.Practice_Aspire_WebApi>("bookingapi")` | 訂房 API   |

**重要**：測試中呼叫 `app.CreateHttpClient("bookingapi")` 的 Resource 名稱必須與 AppHost 宣告完全一致。若名稱不符，測試執行時會出現 `Resource 'xxx' not found` 錯誤。

### 各 Phase 驗證場景

| Phase | 說明                                                                                         |
| ----- | -------------------------------------------------------------------------------------------- |
| P2-1  | 完整四階段端對端流程驗證（Resource 擷取完整性、`DistributedApplicationTestingBuilder` 使用） |
| P2-2  | Writer 輸出模式驗證（`AspireAppFixture`、`CollectionDefinition`、`TestBase` 三件套）         |
| P2-3  | Executor 建置與執行驗證（Docker + Aspire workload 檢查、長超時設定）                         |
| P2-4  | Reviewer Aspire 特定審查項目（無 `WebApplicationFactory`、有 Collection Fixture）            |

### 還原測試專案

工作流程執行後產生的測試檔案不得簽入。若需還原：

```bash
git checkout -- samples/aspire/practice_aspire/tests/
```

---

## D. 常見問題排查

### 1. .NET Aspire workload 未安裝

症狀：AppHost 專案建置失敗，出現 Aspire 相關錯誤。

解法：

```bash
dotnet workload install aspire
dotnet workload list  # 確認 aspire 已列出
```

### 2. Container 啟動超時

症狀：測試執行超過 15 分鐘仍未完成，或出現 Container 逾時錯誤。

可能原因：首次執行需要 pull Docker image（SQL Server 2022 映像檔較大）；機器效能不足。

解法：等待更長時間（Executor 已設定較長超時），或預先 pull 所需 image：

```bash
docker pull mcr.microsoft.com/mssql/server:2022-latest
docker pull redis:7
```

### 3. Resource 名稱不符（CreateHttpClient 錯誤）

症狀：測試出現 `Resource 'xxx' not found` 錯誤。

原因：Writer 在 `CreateHttpClient` 中使用的 Resource 名稱與 AppHost 宣告不一致。

解法：確認 AppHost `Program.cs` 中 `AddProject` 的實際名稱（practice_aspire 使用 `"bookingapi"`），Writer 必須使用完全一致的字串。

### 4. Docker 映像檔 pull 失敗

症狀：Container 無法啟動，出現 Image pull 錯誤。

解法：確認網路連線正常，或手動預先 pull 所需 image：

```bash
docker pull mcr.microsoft.com/mssql/server:2022-latest
```

### 5. Aspire 工作流程執行時間特別長

說明：Aspire 測試比一般整合測試慢很多是正常現象，因為需要：

- 啟動完整的分散式應用環境（SQL Server、Redis、API 全部都要起來）
- 確保所有服務都健康後才開始執行測試案例
- 典型執行時間：8-16 分鐘

這是 Aspire 測試的本質，不是效能問題。

---

## E. 工作流程細節

### 與整合測試的核心差異

| 差異點           | 整合測試                         | Aspire 測試                             |
| ---------------- | -------------------------------- | --------------------------------------- |
| 測試載體         | `WebApplicationFactory`          | `DistributedApplicationTestingBuilder`  |
| Container 管理   | Testcontainers（測試程式碼宣告） | AppHost 聲明（自動管理）                |
| HTTP Client 建立 | `factory.CreateClient()`         | `app.CreateHttpClient("resource-name")` |
| Resource 名稱    | 不需要                           | 必須與 `AddProject("name")` 一致        |
| 啟動時間         | 30 秒-2 分鐘                     | 8-16 分鐘                               |
| Skill 數量       | 4 個進階 Skills                  | 1 個進階 Skill（`aspire-testing`）      |

### Phase 1：Analyzer 分析

Aspire Analyzer 的特殊工作：

- **讀取 AppHost Program.cs**：識別所有宣告的 Resource（`AddSqlServer`、`AddRedis`、`AddProject` 等）
- 讀取 WebAPI Controller 的所有端點和請求/回應 DTO
- 識別 Resource 名稱對齊關係（`AddProject("bookingapi")` 對應 `CreateHttpClient("bookingapi")`）
- **sourceCodeContext 機制**：Analyzer 將所有原始碼內容收錄至交接檔案的 `sourceCodeContext` 欄位，傳遞給後續 Writer 和 Reviewer，避免重複讀取檔案、降低 context 壓力

### Phase 2：Writer 撰寫

Aspire Writer 載入唯一的進階 Skill `aspire-testing`（含 templates 子目錄），輸出以下檔案結構：

```plaintext
tests/Practice.Aspire.AppHost.Tests/
├── Infrastructure/
│   ├── AspireAppFixture.cs        ← DistributedApplicationTestingBuilder 設定
│   ├── TestBase.cs                ← 測試基底類別（HttpClient、Respawn）
│   └── CollectionDefinition.cs   ← xUnit Collection Fixture
├── Models/
│   └── BookingDto.cs             ← API 回應 DTO（選用）
├── Controllers/
│   ├── BookingsHappyPathTests.cs  ← CRUD Happy Path（200/201/204）
│   ├── BookingsValidationTests.cs ← FluentValidation（400/422）
│   ├── BookingsNotFoundTests.cs   ← Not Found（404）
│   ├── BookingsConflictTests.cs   ← 狀態轉換（409）
│   └── BookingsE2ETests.cs       ← 端到端流程
└── GlobalUsings.cs
```

`AspireAppFixture` 核心程式碼模式：

```csharp
public class AspireAppFixture : IAsyncLifetime
{
    public DistributedApplication App { get; private set; } = default!;

    public async Task InitializeAsync()
    {
        var builder = await DistributedApplicationTestingBuilder
            .CreateAsync<Projects.Practice_Aspire_AppHost>();

        builder.Services.ConfigureHttpClientDefaults(http =>
            http.AddStandardResilienceHandler());

        App = await builder.BuildAsync();
        await App.StartAsync();
    }

    public async Task DisposeAsync()
    {
        await App.DisposeAsync();
    }
}
```

測試方法命名採中文三段式 `方法名_情境描述_預期結果`，例如：

```csharp
[Fact]
public async Task 取得預約_有效ID_回傳200與預約資料()
{
    // ...
}

[Fact]
public async Task 確認預約_非法狀態轉換_回傳409Conflict()
{
    // ...
}
```

### Phase 3：Executor 建置與執行

Aspire Executor 的特殊行為：

- **雙重環境檢查**：確認 Docker Desktop 執行中、確認 Aspire workload 已安裝（`dotnet workload list`）
- 執行 `dotnet build` 建置測試專案
- 執行 `dotnet test`，AppHost 自動拉起所有 Aspire 管理的 Container（SQL Server + Redis）
- 使用長超時設定（10 分鐘以上），容納 Container 啟動時間
- 最多 3 輪修正迴圈

### Phase 4：Reviewer 審查（可選）

若 Executor 第一次執行就全數通過（0 修正輪次），Orchestrator 可選擇跳過 Reviewer。

若執行 Reviewer，審查項目包含：

| 審查項目                   | 說明                                                |
| -------------------------- | --------------------------------------------------- |
| Resource 名稱對齊          | `CreateHttpClient` 的參數是否與 AppHost 宣告一致    |
| ContainerLifetime.Session  | 容器是否設定為 Session 級別生命週期（避免重複啟動） |
| 測試隔離                   | 是否使用 Respawn 在每個測試前重置資料庫             |
| 狀態碼覆蓋                 | 200/201/204/400/404/409 是否都有測試                |
| ProblemDetails 斷言        | 錯誤回應是否驗證 ProblemDetails 結構                |
| 禁用 WebApplicationFactory | 確認沒有誤用 `WebApplicationFactory`                |

### 各階段典型耗時

| 階段     | 典型耗時                      |
| -------- | ----------------------------- |
| Analyzer | 2-3 分鐘                      |
| Writer   | 4-9 分鐘                      |
| Executor | 1-2 分鐘（含 Container 啟動） |
| Reviewer | 1-2 分鐘                      |
| **總計** | **8-16 分鐘**                 |
