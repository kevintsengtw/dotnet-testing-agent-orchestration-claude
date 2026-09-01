# Aspire 測試 Orchestrator 架構說明

## 1. 概覽

Aspire 測試 Orchestrator 負責協調 .NET Aspire 分散式應用的整合測試工作流程。

| 項目     | 說明                                  |
| -------- | ------------------------------------- |
| 適用場景 | .NET Aspire 分散式應用整合測試        |
| 觸發指令 | `/dotnet-testing-orchestrator-aspire` |
| 必要環境 | Docker Desktop + .NET Aspire workload |
| 執行時間 | 典型 8-16 分鐘（包含 Container 啟動） |

Orchestrator 本身是 Skill（載入至 main thread context），透過 Agent tool 依序調度四個 subagent 完成測試生命週期。

---

## 2. 與整合測試（WebApplicationFactory）的核心差異

| 差異點            | 整合測試                     | Aspire 測試                          |
| ----------------- | ---------------------------- | ------------------------------------ |
| 測試載體          | WebApplicationFactory        | DistributedApplicationTestingBuilder |
| Container 宣告    | 測試程式碼（Testcontainers） | AppHost Program.cs（自動管理）       |
| HTTP Client 建立  | 自行建立 HttpClient          | `CreateHttpClient("resource-name")`  |
| Resource 名稱限制 | 無                           | 必須與 AppHost 宣告完全一致          |
| 啟動時間          | 30 秒 - 2 分鐘               | 8-16 分鐘                            |

Aspire 測試的容器生命週期由 AppHost 宣告式管理，測試程式碼不需要（也不應該）自行啟動或停止任何容器。

---

## 3. 元件組成

| 元件         | 類型     | 路徑                                                        |
| ------------ | -------- | ----------------------------------------------------------- |
| Orchestrator | Skill    | `.claude/skills/dotnet-testing-orchestrator-aspire/`        |
| Analyzer     | Subagent | `.claude/agents/dotnet-testing-advanced-aspire-analyzer.md` |
| Writer       | Subagent | `.claude/agents/dotnet-testing-advanced-aspire-writer.md`   |
| Executor     | Subagent | `.claude/agents/dotnet-testing-advanced-aspire-executor.md` |
| Reviewer     | Subagent | `.claude/agents/dotnet-testing-advanced-aspire-reviewer.md` |

所有 subagent 透過 Agent tool 呼叫，由 Claude Code 自動載入各自的 `.claude/agents/*.md` 定義（工具權限、Skills 設定、系統 prompt）。

---

## 4. 使用的 Agent Skills

Aspire Orchestrator 固定使用單一 Skill：

| Skill            | 載入時機              | 說明                                 |
| ---------------- | --------------------- | ------------------------------------ |
| `aspire-testing` | 由 Aspire Writer 載入 | 提供 Aspire 整合測試的撰寫規範與範本 |

`requiredSkills` 固定為 `["aspire-testing"]`，不像 Unit/TUnit Orchestrator 有條件載入的組合。這是因為 Aspire 測試的技術組合固定（DistributedApplicationTestingBuilder + 資源管理），複雜度主要來自環境設定而非測試框架本身。

---

## 5. 工作流程細節

### Phase 0：前置清理

Orchestrator 啟動後，首先使用 Glob 檢查測試專案目錄下是否有殘留的 `.orchestrator/` 目錄（前次執行的中間產物）。若有，委託 Executor 以 `task: "cleanup"` 清理後再繼續。

### Phase 1 Analyzer

**工作內容：**

- 搜尋 AppHost 的 `.csproj`（識別 `<IsAspireHost>true</IsAspireHost>` 或 Aspire SDK 版本宣告）
- 讀取 AppHost `Program.cs`，識別所有宣告的資源（資料庫、快取、API 服務）
- 讀取被測試 WebAPI 的所有 Controller 及端點定義
- 掃描測試專案既有的測試基礎設施（`AspireAppFixture`、`CollectionDefinition` 等）

**sourceCodeContext 機制：**

Analyzer 將所有讀取的原始碼內容收錄至分析報告的 `sourceCodeContext` 欄位，並將完整報告寫入交接檔案（`{testProjectDir}/.orchestrator/analysis/{ControllerName}.analysis.json`）。下游的 Writer、Executor、Reviewer 在各自的 Step 0 讀取此交接檔案後，即可直接取得所有原始碼內容，無需重複 I/O，有效降低 context 壓力。

**Orchestrator 傳入的必要參數：**

- AppHost 專案路徑
- 被測試 API 的專案路徑
- 測試專案路徑
- `analysisOutputPath`（由 Orchestrator 預先計算：`{testProjectDir}/.orchestrator/analysis/{ControllerName}.analysis.json`）

### Phase 2 Writer

**工作內容：**

Writer 讀取 Analyzer 交接檔案（含 `sourceCodeContext`），並載入 `aspire-testing` Skill，依照 Aspire 整合測試規範產出測試程式碼。

**測試輸出結構：**

| 檔案               | 說明                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| `AspireAppFixture` | 實作 `IAsyncLifetime`，負責啟動 `DistributedApplication` 並在測試完成後釋放資源                                |
| `TestBase`         | 繼承 `IClassFixture<AspireAppFixture>`，提供 `HttpClient`（透過 `app.CreateHttpClient("resource-name")` 取得） |
| 測試類別           | 依 HTTP 狀態碼分類：HappyPath / Validation / NotFound / Conflict / E2E                                         |

Writer 禁止使用 `WebApplicationFactory` 或 Testcontainers 程式化容器管理。

### Phase 3 Executor

**工作內容：**

- **雙重環境檢查**：確認 Docker Desktop 執行中，且 .NET Aspire workload 已安裝（缺一不可）
- 執行 `dotnet build`（Aspire 測試建置時間比一般整合測試長）
- 執行 `dotnet test`，啟動完整分散式應用環境（AppHost 管理的所有容器）
- 若有測試失敗，進行最多 5 輪的錯誤修正迴圈
- 使用長超時設定（10 分鐘以上），因為 AppHost 啟動多個容器需要較長時間

### Phase 4 Reviewer（可選）

**執行條件：**

若 Executor 第一次執行就全數通過（修正迴圈為 0），且使用者未提出品質審查需求，Orchestrator 可直接跳過 Reviewer，進入結果整合。

**Aspire 特定審查重點：**

- Resource 名稱一致性：測試中使用的名稱是否與 AppHost 宣告完全一致
- `DistributedApplication` 生命週期管理：`AspireAppFixture` 的啟動與釋放是否正確
- 測試案例覆蓋率：端點的 HappyPath、邊界條件、錯誤情境是否完整

### Phase 5：後置清理

結果呈現完畢後，Orchestrator 委託 Executor 清理 `.orchestrator/` 目錄（刪除所有中間產物）。

---

## 6. AppHost Resource 命名規則

Resource 命名一致性是 Aspire 測試特有的核心限制，也是最常見的測試失敗原因。

**規則：**

AppHost `Program.cs` 中宣告資源時指定的名稱字串，必須與測試程式碼中建立 HTTP Client 時使用的名稱完全一致。

```csharp
// AppHost Program.cs 中的宣告
var bookingApi = builder.AddProject<Projects.Booking_WebApi>("bookingapi");
var sql = builder.AddSqlServer("sql");
```

```csharp
// 測試程式碼中必須使用完全相同的字串
var client = app.CreateHttpClient("bookingapi");  // 對應 "bookingapi"
```

**Analyzer 的職責：**

Analyzer 在 Step 1 讀取 AppHost `Program.cs` 後，會提取所有 `AddProject`、`AddSqlServer`、`AddRedis` 等宣告中的名稱字串，收錄至分析報告的 `resources` 陣列。Writer 依此資訊生成測試程式碼，確保名稱一致。

**常見錯誤：**

- 手動輸入資源名稱（容易拼錯或大小寫不符）
- 測試程式碼與 AppHost 版本不同步（AppHost 改名但測試未更新）

---

## 7. 交接機制與 Prompt 精簡原則

Orchestrator 在調度各 subagent 時，只傳遞交接檔案路徑與摘要數字，不嵌入完整 JSON 內容：

| 傳遞給 subagent 的資訊   | 說明                                             |
| ------------------------ | ------------------------------------------------ |
| `analysisFilePath`       | Analyzer 交接檔案路徑                            |
| `writerResultFilePath`   | Writer 交接檔案路徑                              |
| `executorResultFilePath` | Executor 交接檔案路徑                            |
| 摘要數字                 | `endpointCount`、`scenarioCount`、`testCount` 等 |

各 subagent 在 Step 0 自行讀取交接檔案，取得所需的完整資訊（含 `sourceCodeContext`）。這樣設計的目的是避免 Orchestrator prompt 過大，同時確保資訊傳遞的可靠性。

---

## 8. 多目標執行策略

當使用者一次指定多個 API 服務或多種測試場景時：

| 階段             | 執行方式 | 原因                                    |
| ---------------- | -------- | --------------------------------------- |
| Phase 1 Analyzer | 平行     | 各目標獨立分析，無相互依賴              |
| Phase 2 Writer   | 平行     | 各目標獨立撰寫測試                      |
| Phase 3 Executor | 循序     | Aspire AppHost 啟動不可並行（資源競爭） |
| Phase 4 Reviewer | 平行     | 各份測試獨立審查                        |

---

## 9. 錯誤處理

| 錯誤情境                | 處理方式                                                                   |
| ----------------------- | -------------------------------------------------------------------------- |
| Docker 未啟動           | 告知使用者啟動 Docker Desktop，中止執行（Aspire 測試強依賴 Docker）        |
| Aspire workload 未安裝  | 告知執行 `dotnet workload install aspire`，中止執行                        |
| Analyzer 找不到 AppHost | 以 `Grep` 搜尋 `<IsAspireHost>true</IsAspireHost>` 定位，重新啟動 Analyzer |
| Executor 5 輪後仍失敗   | 將失敗訊息傳給 Reviewer，在最終結果區分「環境問題」與「程式邏輯問題」      |
