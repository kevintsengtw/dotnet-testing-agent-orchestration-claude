# 整合測試 Orchestrator 架構說明

## 1. 概覽

| 項目                    | 說明                                                              |
| ----------------------- | ----------------------------------------------------------------- |
| 適用場景                | ASP.NET Core WebAPI + Testcontainers 整合測試                     |
| Orchestrator Skill 路徑 | `.claude/skills/dotnet-testing-orchestrator-integration/SKILL.md` |
| 觸發指令                | `/dotnet-testing-orchestrator-integration`                        |
| 必要環境                | Docker Desktop（執行 Testcontainers 所需）                        |

Orchestrator 是一個**指揮中心**，負責調度四個 advanced-integration 系列的 Subagent，不直接撰寫任何測試程式碼。整個流程從 Phase 0 前置清理開始，依序經過 Analyzer → Writer → Executor → Reviewer 四個核心階段，最終以 Phase 5 後置清理收尾。

整合測試與單元測試的 Orchestrator 架構相同，但 Subagent 改為 `dotnet-testing-advanced-integration-*` 系列，分析目標也從單一類別改為 **WebAPI Controller 端點**。

---

## 2. 元件組成

| 元件         | 類型     | 路徑                                                             |
| ------------ | -------- | ---------------------------------------------------------------- |
| Orchestrator | Skill    | `.claude/skills/dotnet-testing-orchestrator-integration/`        |
| Analyzer     | Subagent | `.claude/agents/dotnet-testing-advanced-integration-analyzer.md` |
| Writer       | Subagent | `.claude/agents/dotnet-testing-advanced-integration-writer.md`   |
| Executor     | Subagent | `.claude/agents/dotnet-testing-advanced-integration-executor.md` |
| Reviewer     | Subagent | `.claude/agents/dotnet-testing-advanced-integration-reviewer.md` |

各 Subagent 的輸入規格定義在各自 Agent 定義檔的「輸入契約（Input Contract）」段落中。Orchestrator 只需按契約傳入對應參數即可。

---

## 3. 使用的 Agent Skills

Writer Subagent 依照 Analyzer 的分析報告，動態載入所需的整合測試 Agent Skills。以下為完整的 Skills 分類清單：

| 分類                | Agent Skills                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| 核心框架            | `dotnet-testing-xunit`（xUnit 基礎架構）                                                        |
| WebAPI 測試基礎設施 | `dotnet-testing-webapplicationfactory`（WebApplicationFactory、TestBase、CollectionDefinition） |
| 容器管理            | `dotnet-testing-testcontainers`（Testcontainers 容器生命週期）                                  |
| 資料庫重置          | `dotnet-testing-respawn`（Respawn 測試間狀態重置）                                              |
| 斷言                | `dotnet-testing-awesomeassertions`                                                              |

> Agent Skills 由外部 repo [`dotnet-testing-agent-skills`](https://github.com/kevintsengtw/dotnet-testing-agent-skills) 提供，需另行安裝後才可供 Writer 載入。

---

## 4. 工作流程細節

### Phase 0：前置清理

Orchestrator 在啟動 Analyzer 之前，先以 Glob 檢查測試專案目錄下是否存在殘留的 `.orchestrator/` 暫存目錄中的 JSON 交接檔案：

- **有殘留**：委託 Executor 以 `task: "cleanup"` 模式清理後，再進入階段 1。
- **無殘留**：直接進入階段 1。

### Phase 1 Analyzer

Analyzer 讀取 WebAPI 專案原始碼（`Program.cs`、Controller、`.csproj`），分析所有端點結構與基礎設施，產出結構化的分析 JSON 報告（交接檔案）。

**分析項目：**

| 分析面向       | 具體內容                                                          |
| -------------- | ----------------------------------------------------------------- |
| 端點結構       | Controller 所有端點的路由、HTTP 方法、請求型別、回應型別          |
| 資料層依賴     | DbContext 類型、Repository 介面、ORM Provider（EF Core / Dapper） |
| Container 需求 | 依資料層依賴判斷需要哪些 Testcontainer                            |
| 測試情境估算   | Happy Path + 驗證失敗 + 資源不存在 + 狀態轉換 + 邊界條件          |

**Analyzer 輸出摘要（回傳給 Orchestrator 的欄位）：**

- `projectName`、`apiArchitecture`、`endpointCount`、`scenarioCount`
- `containerRequirements`（需要啟動的 Container 清單）
- `requiredSkills`
- `analysisFilePath`：實際寫入的交接檔案路徑
- `projectContext`：目標框架版本（`net8.0` / `net9.0` / `net10.0`）

Orchestrator 收到摘要後，使用 Glob 驗證交接檔案是否確實存在，再啟動 Writer。

### Phase 2 Writer

Writer 在 Step 0 讀取 Analyzer 的交接 JSON，按需載入對應的 Agent Skills，然後撰寫測試基礎設施與測試案例。

**分階段啟動判斷：**

| 測試案例數量         | 策略       | 說明                                       |
| -------------------- | ---------- | ------------------------------------------ |
| `scenarioCount ≤ 15` | 單次啟動   | Writer 一次產出所有基礎設施 + 全部測試案例 |
| `scenarioCount > 15` | 分兩次啟動 | 超出 LLM 輸出 token 上限，強制分批         |

**分兩次啟動時的內容分配：**

- **第一次 Writer**：建立測試基礎設施（`GlobalUsings`、`WebApiFactory`、`IntegrationTestBase`、`CollectionDefinition`、`.csproj` 修改）+ 前半部分端點的測試案例。
- **第二次 Writer**：其餘端點的測試案例，延續第一批的命名風格與 Arrange 模式。

**測試基礎設施組成：**

| 元件                   | 說明                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `WebApiFactory`        | 繼承 `WebApplicationFactory<TProgram>`，覆寫 `ConfigureWebHost` 替換資料庫連線為 Container 連線字串                            |
| `IntegrationTestBase`  | 基礎測試類別，實作 `IAsyncLifetime`，管理 Container 啟動/停止與 Respawn 資料庫重置                                             |
| `CollectionDefinition` | xUnit `[CollectionDefinition]` 定義，搭配 `ICollectionFixture<WebApiFactory>`，讓同 Collection 的測試共用同一個 Container 實例 |

**斷言規範：**

- 必須使用 AwesomeAssertions（`response.Should().Be...`）。
- HTTP 狀態碼驗證需搭配 `HttpResponseMessage` 的回應內容一起驗證。

**第二次 Writer 的風格統一要求：**

- 延續第一批的命名風格、`using` 排列順序與 Arrange 模式。
- 物件比較統一使用 `BeEquivalentTo()` 搭配 `options => options.Excluding(...)`。
- lambda 委派宣告統一使用 `var act = () =>`。

### Phase 3 Executor

Executor 負責建置並執行整合測試，並帶有特殊的 Docker 前置檢查與生產程式碼修正授權。

**Docker 環境前置檢查：**

在執行任何建置或測試之前，Executor 必須確認 Docker Desktop 正在執行。若 Docker 未啟動，則停止並告知使用者需先啟動 Docker Desktop，不可繼續執行。

**Respawn 用途：**

測試案例之間需要重置資料庫狀態，避免前一個測試的資料影響後一個測試的驗證結果。Respawn 在每個測試的 `InitializeAsync` 中執行 `await _respawner.ResetAsync(_connection)`，將資料庫回復到乾淨狀態。

**錯誤修正迴圈：**

最多修正 3 輪，超過則回報失敗並進入 Reviewer 階段標示問題。

**生產程式碼 Bug 修正授權（特殊能力）：**

當 Executor 發現測試失敗的根本原因是生產程式碼的問題（非測試程式碼問題）時，有授權直接修正生產程式碼。詳細規範見第 6 節。

**Executor 輸出摘要：**

- `totalTests`、`passedTests`、`failedTests`、`fixRounds`、`executorResultFilePath`

### Phase 4 Reviewer

Reviewer 讀取測試程式碼與三個交接檔案，針對整合測試的特定品質面向進行審查。

**整合測試特定審查項目：**

| 審查面向           | 具體檢查內容                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------- |
| Respawn 使用       | 是否正確在 `InitializeAsync` 呼叫 Respawn 重置資料庫，而非依賴測試順序                            |
| Container 生命週期 | 是否使用 `ICollectionFixture` 讓 Container 在 Collection 層級共用，避免每個測試各自啟動 Container |
| HTTP 狀態碼驗證    | 是否對所有可能的狀態碼（200、201、400、404、409 等）都有測試案例                                  |
| 資料庫約束         | 是否測試了 NOT NULL、UNIQUE、FK 等資料庫約束條件的行為                                            |
| 命名規範           | 是否符合中文三段式格式（`端點方法_情境描述_預期結果`）                                            |
| 斷言完整性         | HTTP 回應的狀態碼與 Body 是否都有驗證，非只驗證其中一項                                           |

**修正流程：**

Reviewer 回傳結果後，Orchestrator 呈現完整報告並**等待使用者指示**，禁止自動觸發修改流程。修改流程為三階段：Writer（修改模式）→ Executor → Reviewer（re-review 模式）。

### Phase 5：後置清理

四階段全部完成並向使用者呈現結果後，Orchestrator 委託 Executor 以 `task: "cleanup"` 清理整個 `{testProjectDir}/.orchestrator/` 目錄（與單元測試 Orchestrator 不同，整合測試 Orchestrator 在最後會清理完整的 `.orchestrator/` 目錄）。

---

## 5. 支援的 Container 技術

| Container  | NuGet 套件                  | 說明                                           |
| ---------- | --------------------------- | ---------------------------------------------- |
| PostgreSQL | `Testcontainers.PostgreSql` | 啟動 PostgreSQL Docker 容器                    |
| SQL Server | `Testcontainers.MsSql`      | 啟動 SQL Server Docker 容器                    |
| MongoDB    | `Testcontainers.MongoDb`    | 啟動 MongoDB Docker 容器                       |
| Redis      | `Testcontainers.Redis`      | 啟動 Redis Docker 容器                         |
| InMemory   | EF Core InMemory Provider   | 不需要 Docker，適用於不依賴 SQL 特性的簡單測試 |

Container 需求由 Analyzer 在 Phase 1 分析時從 WebAPI 專案的 `.csproj` 與 `Program.cs` 自動判斷，無需使用者手動指定（使用者可選擇性提供作為提示）。

---

## 6. 特殊能力：生產程式碼修正

整合測試 Executor 具有「生產程式碼 Bug 修正授權」，這是與單元測試 Executor 的主要差異之一。

**設計動機：**

整合測試是端對端驗證，當測試失敗時，問題可能來自測試程式碼，也可能來自生產程式碼本身的 Bug。若 Executor 發現後者，允許直接修正可大幅縮短排查時間。

**允許修正的範圍：**

| 類型                    | 範例                                                                 |
| ----------------------- | -------------------------------------------------------------------- |
| Controller 路由設定錯誤 | `[Route("api/products")]` 標記缺失、路由參數名稱不一致               |
| 驗證邏輯錯誤            | 回應錯誤的 HTTP 狀態碼（應回 404 但回 500）、回應格式不符合 API 契約 |
| HTTP 回應格式問題       | 回應 Body 結構與 API 文件/測試預期不一致                             |

**不允許修正的範圍：**

| 類型               | 原因                               |
| ------------------ | ---------------------------------- |
| 業務邏輯修改       | 超出測試授權範圍，可能影響其他功能 |
| 新增功能           | 不在測試工作流程的職責內           |
| 資料庫 Schema 修改 | 影響面過大，需人工評估             |

**修正標記：**

當 Executor 修正了生產程式碼，必須在最終結果中特別標記，說明修正了哪些檔案、修正了什麼問題，讓開發人員可以審查這些變更。

---

## 7. 交接檔案機制

Subagent 之間透過 JSON 交接檔案傳遞分析結果，避免在 prompt 中嵌入大量內容：

| 交接檔案                                | 寫入者   | 路徑格式                                          |
| --------------------------------------- | -------- | ------------------------------------------------- |
| `{ControllerName}.analysis.json`        | Analyzer | `{testProjectDir}/.orchestrator/analysis/`        |
| `{ControllerName}.writer-result.json`   | Writer   | `{testProjectDir}/.orchestrator/`                 |
| `{ControllerName}.executor-result.json` | Executor | `{testProjectDir}/.orchestrator/executor-result/` |

Orchestrator 在呼叫各 Subagent 時只傳入交接檔案路徑與摘要數字（`endpointCount`、`scenarioCount`），不嵌入完整 JSON 內容。每個 Subagent 的 Step 0 會自行讀取上游交接檔案。

---

## 8. 多目標並行策略

使用者可一次指定多個 Controller，Orchestrator 採用以下並行策略：

| 階段             | 執行方式 | 原因                                                |
| ---------------- | -------- | --------------------------------------------------- |
| Phase 1 Analyzer | 平行     | 每個 Controller 互不依賴                            |
| Phase 2 Writer   | 平行     | 每個 Controller 獨立撰寫                            |
| Phase 3 Executor | 循序     | `dotnet build` 不可並行，且容器啟動需避免 port 衝突 |
| Phase 4 Reviewer | 平行     | 每份測試獨立審查                                    |

多目標完成後，Orchestrator 彙整呈現：概覽表格（各 Controller 的端點數、測試數、通過狀態、品質評分）+ 各目標詳細結果 + 共用改善建議。

---

## 9. 錯誤處理

| 錯誤情境                   | 處理方式                                                       |
| -------------------------- | -------------------------------------------------------------- |
| Analyzer 找不到 Controller | 向使用者確認路徑，用 Read/Grep 搜尋目標，重新啟動 Analyzer     |
| Docker 未啟動              | 告知使用者需啟動 Docker Desktop；若測試不涉及 Container 則繼續 |
| Writer 回應超出 token 上限 | 強制改用分兩次啟動策略                                         |
| Executor 3 輪後仍失敗      | 將失敗訊息傳給 Reviewer，在結果中區分環境問題與邏輯問題        |
