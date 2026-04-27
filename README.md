# dotnet-testing Agent Orchestration for Claude Code

這個 repo 展示如何使用 **Claude Code Subagents** 自動化完成四種 .NET 測試工作流程：**Unit Testing**、**Integration Testing**、**Aspire Testing**、**TUnit Testing**。

每種工作流程都由一個 **Orchestrator Skill** 負責指揮，依序呼叫 Analyzer → Writer → Executor → Reviewer 四個專用 Subagent，完成從分析目標程式碼、撰寫測試、執行驗證，到審查品質的完整流程。

---

## 目錄

- [dotnet-testing Agent Orchestration for Claude Code](#dotnet-testing-agent-orchestration-for-claude-code)
  - [目錄](#目錄)
  - [系統需求](#系統需求)
  - [安裝](#安裝)
    - [Clone 此 Repo](#clone-此-repo)
    - [安裝外部 Agent Skills](#安裝外部-agent-skills)
    - [安裝計時 Hooks（可選）](#安裝計時-hooks可選)
  - [架構說明](#架構說明)
    - [.claude/agents/ — 16 個 Subagent](#claudeagents--16-個-subagent)
    - [.claude/skills/ — Orchestrator Skills](#claudeskills--orchestrator-skills)
    - [.claude/hooks/ — 計時 Hook](#claudehooks--計時-hook)
  - [四種測試工作流程](#四種測試工作流程)
    - [單元測試（Unit Testing）](#單元測試unit-testing)
    - [整合測試（Integration Testing）](#整合測試integration-testing)
    - [Aspire 測試（Aspire Testing）](#aspire-測試aspire-testing)
    - [TUnit 測試（TUnit Testing）](#tunit-測試tunit-testing)
  - [詳細使用指南](#詳細使用指南)
  - [注意事項](#注意事項)

---

## 系統需求

| 工具                 | 版本             | 備註                          |
| -------------------- | ---------------- | ----------------------------- |
| Claude Code CLI      | 最新版           | 必要                          |
| .NET SDK             | 8.0 / 9.0 / 10.0 | 依測試專案版本                |
| Docker Desktop       | 最新版           | Integration / Aspire 測試需要 |
| .NET Aspire workload | 最新版           | Aspire 測試需要               |

安裝 Aspire workload：

```bash
dotnet workload install aspire
```

---

## 安裝

### Clone 此 Repo

```bash
git clone https://github.com/kevintsengtw/dotnet-testing-agent-orchestration-claude.git
cd dotnet-testing-agent-orchestration-claude
```

### 安裝外部 Agent Skills

Writer Subagent 在撰寫測試時，需要載入各技術的 Skill 來確保輸出符合最佳實踐。這些 Agent Skills 由獨立 repo 提供，需另行下載並安裝到本 repo 的 `.claude/skills/` 目錄下。

**下載位置：**

```plaintext
https://github.com/kevintsengtw/dotnet-testing-agent-skills
```

**安裝路徑：** 將下載的 Skill 目錄放入本 repo 的 `.claude/skills/`

```plaintext
dotnet-testing-agent-orchestration-claude/
└── .claude/
    └── skills/
        ├── dotnet-test/                              ← 本 repo 已內含
        ├── dotnet-testing-orchestrator-unit/         ← 本 repo 已內含
        ├── dotnet-testing-orchestrator-integration/  ← 本 repo 已內含
        ├── dotnet-testing-orchestrator-aspire/       ← 本 repo 已內含
        ├── dotnet-testing-orchestrator-tunit/        ← 本 repo 已內含
        │
        ├── dotnet-testing-autofixture-*/             ← 來自外部 repo
        ├── dotnet-testing-nsubstitute-*/             ← 來自外部 repo
        ├── dotnet-testing-awesomeassertions-*/       ← 來自外部 repo
        ├── dotnet-testing-bogus-*/                   ← 來自外部 repo
        ├── dotnet-testing-datetime-*/                ← 來自外部 repo
        ├── dotnet-testing-filesystem-*/              ← 來自外部 repo
        ├── dotnet-testing-testcontainers-*/          ← 來自外部 repo
        ├── dotnet-testing-aspire-testing/            ← 來自外部 repo
        ├── dotnet-testing-tunit-fundamentals/        ← 來自外部 repo
        └── dotnet-testing-tunit-advanced/            ← 來自外部 repo
```

> Skills 以目錄形式存在，每個目錄內含 `SKILL.md`。確認所有需要的 Skill 目錄都在 `.claude/skills/` 下後即可使用。

### 安裝計時 Hooks（可選）

`.claude/hooks/` 內含計時 Hook，可在 Orchestrator 輸出中自動顯示每個 Subagent 的執行時間。

```bash
node .claude/hooks/install-hooks.js
```

執行後，Hook 設定會自動寫入 `.claude/settings.json`。若不安裝，Orchestrator 仍可正常運作，只是不會顯示耗時資訊。

---

## 架構說明

### .claude/agents/ — 16 個 Subagent

16 個 Subagent 定義檔分成 4 組，每組對應一種測試類型，每組各有 4 個角色：

| 角色         | 職責                                                           |
| ------------ | -------------------------------------------------------------- |
| **Analyzer** | 分析目標程式碼結構、依賴項、所需測試技術，產出分析報告         |
| **Writer**   | 根據分析報告載入對應 Skills，撰寫符合最佳實踐的測試程式碼      |
| **Executor** | 建置解決方案並執行測試，處理編譯錯誤與測試失敗的修正迴圈       |
| **Reviewer** | 審查測試品質（命名、斷言、覆蓋率、框架合規性等），提出改善建議 |

| 測試類型    | Analyzer                                       | Writer                                       | Executor                                       | Reviewer                                       |
| ----------- | ---------------------------------------------- | -------------------------------------------- | ---------------------------------------------- | ---------------------------------------------- |
| Unit        | `dotnet-testing-analyzer`                      | `dotnet-testing-writer`                      | `dotnet-testing-executor`                      | `dotnet-testing-reviewer`                      |
| Integration | `dotnet-testing-advanced-integration-analyzer` | `dotnet-testing-advanced-integration-writer` | `dotnet-testing-advanced-integration-executor` | `dotnet-testing-advanced-integration-reviewer` |
| Aspire      | `dotnet-testing-advanced-aspire-analyzer`      | `dotnet-testing-advanced-aspire-writer`      | `dotnet-testing-advanced-aspire-executor`      | `dotnet-testing-advanced-aspire-reviewer`      |
| TUnit       | `dotnet-testing-advanced-tunit-analyzer`       | `dotnet-testing-advanced-tunit-writer`       | `dotnet-testing-advanced-tunit-executor`       | `dotnet-testing-advanced-tunit-reviewer`       |

### .claude/skills/ — Orchestrator Skills

本 repo 內含 5 個 Skills：

| Skill 目錄                                 | 用途                                                          |
| ------------------------------------------ | ------------------------------------------------------------- |
| `dotnet-test/`                             | .NET 測試執行器，提供 build-first 的測試執行策略              |
| `dotnet-testing-orchestrator-unit/`        | 單元測試 Orchestrator，指揮 4 個 Unit Testing Subagent        |
| `dotnet-testing-orchestrator-integration/` | 整合測試 Orchestrator，指揮 4 個 Integration Testing Subagent |
| `dotnet-testing-orchestrator-aspire/`      | Aspire 測試 Orchestrator，指揮 4 個 Aspire Testing Subagent   |
| `dotnet-testing-orchestrator-tunit/`       | TUnit 測試 Orchestrator，指揮 4 個 TUnit Testing Subagent     |

**Orchestrator 的 4 階段流程：**

```plaintext
/dotnet-testing-orchestrator-*
        │
        ▼
  Phase 1: Analyzer
  （分析目標程式碼，產出分析報告）
        │
        ▼
  Phase 2: Writer
  （載入 Skills，撰寫測試程式碼）
        │
        ▼
  Phase 3: Executor
  （建置 + 執行測試，修正迴圈）
        │
        ▼
  Phase 4: Reviewer
  （審查品質，提出改善建議）
```

每個階段由 Orchestrator 透過 Agent 工具依序呼叫，不可跳過或平行執行。Reviewer 完成後，Orchestrator 會依建議再次呼叫 Writer + Executor 進行修正。

### .claude/hooks/ — 計時 Hook

| 檔案                                 | 類型        | 作用                                                      |
| ------------------------------------ | ----------- | --------------------------------------------------------- |
| `dotnet-testing-agent-timer-pre.sh`  | PreToolUse  | 偵測到 `dotnet-testing-*` Subagent 被呼叫時，記錄開始時間 |
| `dotnet-testing-agent-timer-post.sh` | PostToolUse | Subagent 完成後，計算並輸出耗時（格式：`M 分 S 秒`）      |
| `install-hooks.js`                   | 安裝腳本    | 將上述兩個 Hook 設定寫入 `.claude/settings.json`          |

Hook 安裝後，Orchestrator 的輸出表格中會自動顯示每個 Subagent 的執行時間，方便掌握整體耗時分布。

---

## 四種測試工作流程

### 單元測試（Unit Testing）

**觸發指令（在 Claude Code 內輸入）：**

```plaintext
/dotnet-testing-orchestrator-unit
```

**使用格式：**

```text
/dotnet-testing-orchestrator-unit 為 [類別名稱] 撰寫單元測試。
被測試目標：[來源檔案路徑]
測試專案：[測試專案 .csproj 路徑]
```

**範例：**

```text
/dotnet-testing-orchestrator-unit 為 SubscriptionService 撰寫單元測試。
被測試目標：samples/unit/practice/src/Practice.Core/Services/SubscriptionService.cs
測試專案：samples/unit/practice/tests/Practice.Core.Tests/Practice.Core.Tests.csproj
```

**練習專案：** [`samples/unit/practice/`](samples/unit/practice/)

這個練習專案涵蓋 6 個學習階段，從基礎到進階逐步引導：

| 階段    | 目標類別                                     | 學習重點                                                   |
| ------- | -------------------------------------------- | ---------------------------------------------------------- |
| Phase 1 | `TemperatureConverter`                       | 3A Pattern、xUnit `[Fact]` / `[Theory]`、AwesomeAssertions |
| Phase 2 | `WeatherAlertService`                        | NSubstitute Mock、Stub vs Mock、非同步測試                 |
| Phase 3 | `EmployeeService`                            | AutoFixture 測試資料、循環參考處理、Bogus 擬真資料         |
| Phase 4 | `SubscriptionService`, `ConfigurationLoader` | FakeTimeProvider、MockFileSystem                           |
| Phase 5 | `OrderProcessingService`                     | 跨技能整合（NSubstitute + AutoFixture + TimeProvider）     |
| Phase 6 | `LegacyReportGenerator`                      | 遺留程式碼重構、依賴注入改造                               |

**技術棧：** xUnit + NSubstitute + AutoFixture + AwesomeAssertions + Bogus + FakeTimeProvider + MockFileSystem

---

### 整合測試（Integration Testing）

**觸發指令：**

```plaintext
/dotnet-testing-orchestrator-integration
```

**使用格式：**

```text
/dotnet-testing-orchestrator-integration 為 [Controller 名稱] 撰寫整合測試。
被測試 API：[WebAPI 專案目錄路徑]
測試專案：[測試專案 .csproj 路徑]
[Controller 名稱] 有 N 個端點（[端點說明]），使用 [資料庫技術]。
```

**範例：**

```text
/dotnet-testing-orchestrator-integration 為 OrdersController 撰寫整合測試。
被測試 API：samples/integration/practice_integration/src/Practice.Integration.WebApi
測試專案：samples/integration/practice_integration/tests/Practice.Integration.WebApi.Tests/Practice.Integration.WebApi.Tests.csproj
OrdersController 有 8 個端點（CRUD + Confirm/Cancel 狀態轉換），使用 PostgreSQL + FluentValidation。
```

**練習專案：** [`samples/integration/practice_integration/`](samples/integration/practice_integration/)（提供 net8.0 / net10.0 版本）

**待測 API：** Orders CRUD + 狀態轉換（8 個端點）

| HTTP Method | Route                           | 說明             |
| ----------- | ------------------------------- | ---------------- |
| GET         | `api/orders`                    | 取得所有訂單     |
| GET         | `api/orders/{id}`               | 根據 ID 取得訂單 |
| GET         | `api/orders/by-status/{status}` | 根據狀態查詢訂單 |
| POST        | `api/orders`                    | 建立新訂單       |
| PUT         | `api/orders/{id}`               | 更新訂單         |
| PATCH       | `api/orders/{id}/confirm`       | 確認訂單         |
| PATCH       | `api/orders/{id}/cancel`        | 取消訂單         |
| DELETE      | `api/orders/{id}`               | 刪除訂單         |

**5 個驗證場景：**

1. InMemory DB — EF Core InMemory Provider 基本整合測試
2. SQL Server Testcontainers — 容器化資料庫替換 InMemory
3. FluentValidation — 請求驗證與 ValidationProblemDetails 回傳
4. PostgreSQL Testcontainers — PostgreSQL 容器整合
5. MongoDB / Redis — NoSQL 容器整合（進階場景）

**技術需求：** Docker Desktop

---

### Aspire 測試（Aspire Testing）

**觸發指令：**

```plaintext
/dotnet-testing-orchestrator-aspire
```

**使用格式：**

```text
/dotnet-testing-orchestrator-aspire 為 [Controller 名稱] 撰寫 Aspire 整合測試。
被測試 API：[WebAPI 專案目錄路徑]
AppHost：[AppHost 專案目錄路徑]
測試專案：[測試專案 .csproj 路徑]
[Controller 名稱] 有 N 個端點（[端點說明]），使用 [Resource 說明]。
```

**範例：**

```text
/dotnet-testing-orchestrator-aspire 為 BookingsController 撰寫 Aspire 整合測試。
被測試 API：samples/aspire/practice_aspire/src/Practice.Aspire.WebApi
AppHost：samples/aspire/practice_aspire/src/Practice.Aspire.AppHost
測試專案：samples/aspire/practice_aspire/tests/Practice.Aspire.AppHost.Tests/Practice.Aspire.AppHost.Tests.csproj
BookingsController 有 9 個端點（CRUD + Confirm/CheckIn/Cancel 狀態轉換 + ByStatus 查詢），使用 SQL Server（BookingsDb）+ Redis（cache）。
```

**練習專案：** [`samples/aspire/practice_aspire/`](samples/aspire/practice_aspire/)

**AppHost Resource 拓撲：**

| Resource     | 類型       | 說明                        |
| ------------ | ---------- | --------------------------- |
| `sql`        | SQL Server | 資料庫容器                  |
| `BookingsDb` | Database   | SQL Server 上的資料庫       |
| `cache`      | Redis      | 快取容器                    |
| `bookingapi` | Project    | 被編排的 WebAPI（預約管理） |

**Aspire Testing 的特殊之處：**

- 使用 `DistributedApplicationTestingBuilder`（非 `WebApplicationFactory`）
- 需要 Docker Desktop + .NET Aspire workload
- 測試固件採用 `AspireAppFixture` + `CollectionDefinition` + `TestBase` 模式

**4 個驗證場景（P2-1 ~ P2-4）：** 分別驗證 Orchestrator 的端對端流程、Writer 輸出模式、Executor 建置執行、Reviewer Aspire 特定項目審查。

---

### TUnit 測試（TUnit Testing）

**觸發指令：**

```plaintext
/dotnet-testing-orchestrator-tunit
```

**使用格式：**

```text
/dotnet-testing-orchestrator-tunit 為 [類別名稱] 撰寫 TUnit 測試。
被測試目標：[來源檔案路徑]
測試專案：[測試專案 .csproj 路徑]
[類別說明與方法數量、依賴項目等補充資訊]
```

**範例：**

```text
/dotnet-testing-orchestrator-tunit 為 BookCatalog 撰寫 TUnit 測試。
被測試目標：samples/tunit/practice_tunit/src/Practice.TUnit.Core/Services/BookCatalog.cs
測試專案：samples/tunit/practice_tunit/tests/Practice.TUnit.Core.Tests/Practice.TUnit.Core.Tests.csproj
BookCatalog 是純函式類別（6 個靜態方法），適合使用 [Test] + [Arguments] 參數化測試。
```

**練習專案：** [`samples/tunit/practice_tunit/`](samples/tunit/practice_tunit/)（圖書館管理系統領域）

**TUnit 與 xUnit 的主要差異：**

| 項目     | xUnit                  | TUnit                              |
| -------- | ---------------------- | ---------------------------------- |
| 專案類型 | Library                | **Exe（`OutputType=Exe`）**        |
| 執行指令 | `dotnet test`          | **`dotnet run`**                   |
| 測試方法 | 可以是 sync            | **必須是 `async Task`**            |
| 參數化   | `[InlineData]`         | `[Arguments]`                      |
| 資料來源 | `[MemberData]`         | `[MethodDataSource]` / `[Matrix]`  |
| 生命週期 | 建構子 / `IDisposable` | `[Before(Test)]` / `[After(Test)]` |

**被測類別與驗證場景：**

| 類別                   | 場景 | 測試技術需求                               |
| ---------------------- | ---- | ------------------------------------------ |
| `BookCatalog`          | P3-1 | 純函式、`[Test]` + `[Arguments]`           |
| `LibraryMemberService` | P3-2 | Mock、`[MethodDataSource]` / `[Matrix]`    |
| `LoanService`          | P3-3 | Mock、狀態轉換、Executor `dotnet run` 驗證 |
| `ReservationService`   | P3-4 | TimeProvider、Reviewer 合規性審查          |
| `CatalogExportService` | P3-5 | IFileSystem、xUnit → TUnit 遷移場景        |

---

## 詳細使用指南

完整的 Lab 流程、分步驟操作指令與更多範例，請參考：

**[dotnet-testing-agent-orchestration-claude-lab](https://github.com/kevintsengtw/dotnet-testing-agent-orchestration-claude-lab)** 的 `docs/` 目錄

---

## 注意事項

`samples/*/tests/` 下的測試專案為空白起點，供 Subagent 工作流程練習使用。

Subagent 執行過程中產生的測試類別檔案與 `.csproj` 修改**不得簽入或推送至遠端**，以維持練習環境的初始狀態。
