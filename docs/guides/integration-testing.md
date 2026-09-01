# 整合測試工作流程使用指南

本文件說明如何使用 `dotnet-testing-orchestrator-integration` 為 ASP.NET Core WebAPI 自動產生整合測試。適用場景為需要驗證 HTTP 端點行為、資料持久化邏輯及中介軟體的整合測試，支援 InMemory、PostgreSQL、SQL Server、MongoDB、Redis 五種資料層組合。觸發指令：`/dotnet-testing-orchestrator-integration`。技術組合：WebApplicationFactory + Testcontainers + Respawn + AwesomeAssertions。

---

## A. 前提條件

- **Claude Code CLI** 已安裝並登入
- **dotnet-testing-agent-skills 已安裝**：斜線指令 `/dotnet-testing-orchestrator-integration` 必須可用（需從外部 repo 安裝 Agent Skills）
- **.NET SDK**：8.0、9.0、10.0 至少安裝一個版本
- **Docker Desktop 必須執行中**：Testcontainers 依賴 Docker Engine 啟動資料庫容器，未啟動時 Executor 會直接回報錯誤
- **支援的資料庫容器**：
  - PostgreSQL（`postgres:latest`）
  - SQL Server（`mcr.microsoft.com/mssql/server`）
  - MongoDB（`mongo:latest`）
  - Redis（`redis:latest`）
  - EF Core InMemory（不需要 Docker）

---

## B. 指令與使用範例

### 基本指令

```text
/dotnet-testing-orchestrator-integration
```

觸發後，Orchestrator 會依序調度 Analyzer → Writer → Executor → Reviewer 四個 subagent，全程自動執行，不需要手動介入。

### 使用範例

---

**情境 1：單一 Controller 搭配 InMemory 資料庫**

基本的 CRUD 操作整合測試，使用 EF Core InMemory Provider，不需要實際啟動資料庫容器。適合快速驗證端點路由與商業邏輯。

```text
/dotnet-testing-orchestrator-integration 為 OrdersController 撰寫整合測試。
被測試 API：samples/integration/practice_integration/src/Practice.Integration.WebApi
測試專案：samples/integration/practice_integration/tests/Practice.Integration.WebApi.Tests/Practice.Integration.WebApi.Tests.csproj
OrdersController 有 8 個端點（CRUD + Confirm/Cancel），使用 EF Core InMemory。
```

---

**情境 2：搭配 SQL Server Testcontainer**

使用真實的 SQL Server 容器，驗證需要資料庫特定行為（如唯一鍵、外鍵約束）的測試情境。Analyzer 會自動偵測 SQL Server 依賴並產生對應的容器設定。

```text
/dotnet-testing-orchestrator-integration 為 OrdersController 撰寫整合測試。
被測試 API：samples/integration/practice_integration/src/Practice.Integration.WebApi
測試專案：samples/integration/practice_integration/tests/Practice.Integration.WebApi.Tests/Practice.Integration.WebApi.Tests.csproj
資料庫：SQL Server Testcontainers，需測試唯一鍵約束與重複建立訂單的錯誤回應。
```

---

**情境 3：含 FluentValidation 請求驗證**

驗證 FluentValidation 的規則是否正確整合到 HTTP Pipeline，確認無效請求會回傳 `400 ValidationProblemDetails`。

```text
/dotnet-testing-orchestrator-integration 為 OrdersController 撰寫整合測試。
被測試 API：samples/integration/practice_integration/src/Practice.Integration.WebApi
測試專案：samples/integration/practice_integration/tests/Practice.Integration.WebApi.Tests/Practice.Integration.WebApi.Tests.csproj
重點：涵蓋 FluentValidation 驗證失敗情境，驗證 ValidationProblemDetails 回應結構（400 Bad Request）。
```

---

**情境 4：搭配 PostgreSQL Testcontainer**

使用 PostgreSQL 容器，適合需要驗證跨資料庫相容性或使用 PostgreSQL 特定功能的場景。

```text
/dotnet-testing-orchestrator-integration 為 OrdersController 撰寫整合測試。
被測試 API：samples/integration/practice_integration/src/Practice.Integration.WebApi
測試專案：samples/integration/practice_integration/tests/Practice.Integration.WebApi.Tests/Practice.Integration.WebApi.Tests.csproj
OrdersController 有 8 個端點（CRUD + Confirm/Cancel 狀態轉換），使用 PostgreSQL + FluentValidation。
```

---

## C. 練習專案

### 目錄結構

練習專案位於 `samples/integration/practice_integration/`：

```text
practice_integration/
├── Practice.Integration.slnx
├── README.md
├── src/
│   └── Practice.Integration.WebApi/        # 待測試的 WebAPI 專案
│       ├── Controllers/
│       │   └── OrdersController.cs
│       ├── Data/
│       │   └── OrderDbContext.cs
│       ├── Handlers/
│       │   ├── FluentValidationExceptionHandler.cs
│       │   └── GlobalExceptionHandler.cs
│       ├── Models/
│       │   ├── Order.cs
│       │   └── OrderRequests.cs
│       ├── Validators/
│       │   └── OrderValidators.cs
│       └── Program.cs
└── tests/
    └── Practice.Integration.WebApi.Tests/  # 測試專案（由 Orchestrator 填充）
        └── Practice.Integration.WebApi.Tests.csproj
```

### 各驗證情境說明

| 情境   | 資料庫                      | 重點                                        |
| ------ | --------------------------- | ------------------------------------------- |
| 情境 1 | InMemory EF Core            | 基本整合測試結構、端點路由驗證              |
| 情境 2 | SQL Server Testcontainer    | 真實資料庫環境、資料庫約束測試              |
| 情境 3 | InMemory + FluentValidation | 請求驗證測試、ValidationProblemDetails 格式 |
| 情境 4 | PostgreSQL Testcontainer    | 跨資料庫相容性驗證                          |
| 情境 5 | MongoDB / Redis             | 進階 NoSQL 整合測試                         |

### 測試 API 端點說明

`OrdersController` 提供以下端點，所有情境均以此 Controller 為測試目標：

| HTTP Method | Route                           | 說明                 |
| ----------- | ------------------------------- | -------------------- |
| GET         | `api/orders`                    | 取得所有訂單         |
| GET         | `api/orders/{id}`               | 根據 ID 取得訂單     |
| GET         | `api/orders/by-status/{status}` | 根據狀態查詢訂單     |
| POST        | `api/orders`                    | 建立新訂單           |
| PUT         | `api/orders/{id}`               | 更新訂單             |
| PATCH       | `api/orders/{id}/confirm`       | 確認訂單（狀態轉換） |
| PATCH       | `api/orders/{id}/cancel`        | 取消訂單（狀態轉換） |
| DELETE      | `api/orders/{id}`               | 刪除訂單             |

### 還原測試專案

工作流程執行後若需還原測試專案至初始空白狀態：

```bash
git checkout -- samples/integration/practice_integration/tests/
```

---

## D. 常見問題排查

**1. Docker 未啟動**

- 症狀：Testcontainers 初始化失敗，錯誤訊息包含 `Cannot connect to the Docker daemon`
- 解法：啟動 Docker Desktop，等待完全就緒後執行 `docker ps` 確認可正常連線，再重新觸發指令

**2. Testcontainer Image Pull 失敗**

- 症狀：Container 啟動時卡住，或出現 Pull 逾時、速率限制錯誤
- 可能原因：網路問題或 Docker Hub 請求速率限制（Rate Limit）
- 解法：手動預先拉取所需 image

```bash
docker pull postgres:latest
docker pull mcr.microsoft.com/mssql/server
docker pull mongo:latest
docker pull redis:latest
```

**3. EF Core 版本與 TFM 不符**

- 症狀：建置錯誤，提示套件版本不相容
- 說明：各 .NET 版本對應不同的 EF Core 主版本，Writer 會依 `TargetFramework` 自動選擇，但若手動修改 `.csproj` 可能造成不符

| TFM     | EF Core 版本 |
| ------- | ------------ |
| net8.0  | 8.0.x        |
| net9.0  | 9.0.x        |
| net10.0 | 10.0.x       |

- 解法：確認 `.csproj` 中的 `PackageReference` 版本號與 `TargetFramework` 對齊

**4. Redis 命名衝突**

- 症狀：編譯錯誤，`Order`（或其他 domain model 名稱）在 `StackExchange.Redis` 命名空間下有同名型別
- 解法：Writer 會在 `GlobalUsings.cs` 加入 alias，若手動撰寫測試需自行加入：

```csharp
global using RedisOrder = StackExchange.Redis.Order;
```

**5. Writer 沒有分兩次委派**

- 說明：當測試情境數 > 15 時，Orchestrator 應自動分兩次委派 Writer（第一次建基礎設施，第二次寫測試）。**這是 integration 專屬的兩階段委派，與 unit／tunit 已移除的平行 Writer 分割無關。**若沒有觸發，可能是 Analyzer 的情境估計值偏低，導致 Orchestrator 誤判為單次即可完成。
- 後果：Writer 可能因輸出 token 超限而產生不完整的測試程式碼
- 解法：在指令中明確說明端點數量與預估情境數，讓 Analyzer 的估算更準確

---

## E. 工作流程細節

### Phase 0：清理暫存

Orchestrator 啟動後的第一個動作是檢查測試專案目錄下的 `.orchestrator/` 資料夾。若有前次執行遺留的暫存 JSON 檔案，會先委託 Executor 以 `task: "cleanup"` 清除，確保本次分析結果不受舊資料污染，再進入 Phase 1。

### Phase 1：Analyzer 分析

Orchestrator 將 WebAPI 專案路徑與目標 Controller 名稱交給 `dotnet-testing-advanced-integration-analyzer` subagent。Analyzer 執行以下分析並產出結構化 JSON 交接檔案：

- 識別 Controller 的所有端點（路由、HTTP Method、請求參數型別、回應型別）
- 分析資料層依賴（EF Core DbContext 的 Entity 清單、DI 註冊方式）
- 判斷容器需求（偵測 PostgreSQL / SQL Server / MongoDB / Redis 依賴，產出 `containerRequirements`）
- 識別 FluentValidation Validator 清單與中介軟體管線
- 估算測試情境數（每個端點的 Happy Path + 驗證失敗 + 資源不存在 + 狀態轉換衝突等）
- 偵測潛在命名衝突風險（如 Redis 型別與 domain model 的名稱碰撞）

Analyzer 完成後，Orchestrator 會驗證交接檔案確實存在，再進入 Phase 2。

### Phase 2：Writer 撰寫

Orchestrator 將交接檔案路徑交給 `dotnet-testing-advanced-integration-writer` subagent。Writer 載入 4 個進階 Skills：

- `aspnet-integration-testing`：WebApplicationFactory 基礎設施建立模式
- `webapi-integration-testing`：HTTP 端點測試模式
- `testcontainers-database`：PostgreSQL / SQL Server 容器設定
- `testcontainers-nosql`：MongoDB / Redis 容器設定

Writer 建立的測試基礎設施包含：`WebApiFactory`（繼承 `WebApplicationFactory<TProgram>`）、`IntegrationTestBase`（含 `HttpClient` 與 Respawn 初始化）、`CollectionDefinition`（xUnit Collection Fixture）。

**兩階段委派策略**（integration 專屬，非平行分割）：

| 測試情境數 | 委派策略                                                         |
| ---------- | ---------------------------------------------------------------- |
| ≤ 15 個    | 單次委派：基礎設施 + 全部測試案例一起產出                        |
| > 15 個    | 分兩次委派：第一次僅建基礎設施，第二次依既有風格撰寫全部測試案例 |

第二次委派時會加入風格統一指令，確保兩批測試的命名方式、`using` 排列順序、`Arrange` 模式保持一致。

### Phase 3：Executor 建置與執行

Orchestrator 將 Writer 產出的測試檔案路徑交給 `dotnet-testing-advanced-integration-executor` subagent。Executor 的執行步驟：

1. **Docker 環境檢查**：在建置前確認 Docker Desktop 正在執行，若未啟動則回報錯誤並終止
2. 執行 `dotnet build` 建置測試專案
3. 執行 `dotnet test`（Testcontainers 自動啟動資料庫容器，測試結束後自動清理）
4. 若有測試失敗，最多進行 3 輪修正迴圈

**特殊能力**：若 Executor 發現測試失敗的根本原因是生產程式碼的 Bug（例如路由設定錯誤、缺少 Validator DI 註冊、驗證邏輯有誤），有授權直接修正生產程式碼。修正完成後，在結果報告中會明確標記為「生產程式碼 Bug 修正」。

### Phase 4：Reviewer 審查

Orchestrator 將測試檔案路徑與各階段交接檔案交給 `dotnet-testing-advanced-integration-reviewer` subagent。Reviewer 的審查項目：

- **HTTP 狀態碼覆蓋**：200、201、204、400、404、409 等狀態碼是否都有對應測試
- **ProblemDetails 驗證**：錯誤回應是否驗證 `ProblemDetails` / `ValidationProblemDetails` 結構
- **Container 生命週期管理**：`CollectionFixture` 是否正確使用，容器是否共用於同一 Collection
- **測試資料隔離**：是否使用 Respawn 在每個測試前重置資料庫狀態，避免測試間互相污染
- **資料庫約束測試**：是否有測試唯一鍵、外鍵等資料庫限制條件的邊界情境
- **命名規範**：測試方法是否遵循中文三段式 `方法名_情境描述_預期結果`（例：`建立訂單_送出無效的請求_回傳400BadRequest`）

Reviewer 完成後，Orchestrator 整合四階段結果呈現給使用者，包含品質評分、改善建議與各階段耗時。

### Phase 5：清理完成

四階段流程全部完成並將結果呈現給使用者後，Orchestrator 委託 Executor 清理 `{testProjectDir}/.orchestrator/` 目錄，移除本次工作流程產生的所有暫存 JSON 交接檔案。
