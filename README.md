# dotnet-testing Agent Orchestration for Claude Code

這個 repo 提供完整的 **Claude Code Subagents** .NET 測試工作流程範例，展示如何透過 Agent Orchestration 自動化完成四種測試類型：**Unit Testing**、**Integration Testing**、**Aspire Testing**、**TUnit Testing**。

核心架構採用 **1+4 模型**：1 個 Orchestrator Skill 負責指揮 4 個專用 Subagent，依序完成 Analyzer → Writer → Executor → Reviewer 的完整測試流程——從分析目標程式碼、撰寫測試、執行驗證，到審查品質，全程自動化。

本 repo 的目標讀者是使用 Claude Code 開發 .NET 專案的開發人員，提供可直接套用於實際專案的工作流程範例與練習素材。

- [dotnet-testing Agent Orchestration for Claude Code](#dotnet-testing-agent-orchestration-for-claude-code)
  - [架構概覽](#架構概覽)
  - [系統需求](#系統需求)
  - [安裝與環境設定](#安裝與環境設定)
    - [方式 A：VS Code Extension（推薦）](#方式-avs-code-extension推薦)
    - [方式 B：手動部署](#方式-b手動部署)
      - [步驟 1：Clone 儲存庫](#步驟-1clone-儲存庫)
      - [步驟 2：複製部署目標](#步驟-2複製部署目標)
      - [步驟 3：確認完整目錄結構](#步驟-3確認完整目錄結構)
      - [步驟 4：安裝計時 Hook（可選）](#步驟-4安裝計時-hook可選)
      - [步驟 5：驗證安裝](#步驟-5驗證安裝)
  - [快速開始](#快速開始)
  - [四種測試工作流程](#四種測試工作流程)
  - [練習專案](#練習專案)
  - [文件](#文件)

---

## 架構概覽

Orchestrator Skill 接收使用者指令後，依序呼叫四個 Subagent：

```text
Orchestrator Skill
    ├── Analyzer Subagent  （分析目標類別、依賴項、測試技術）
    ├── Writer Subagent    （載入 Skills，產生測試程式碼）
    ├── Executor Subagent  （建置並執行測試，處理修正迴圈）
    └── Reviewer Subagent  （審查命名、斷言、覆蓋率、框架合規性）
```

每個階段必須依序完成，Reviewer 提出改善建議後，Orchestrator 會再次呼叫 Writer + Executor 進行修正。

> 詳細架構圖與各 Orchestrator 流程說明，請參閱 [docs/architecture/overview.md](docs/architecture/overview.md)

---

## 系統需求

**必要：**

| 工具                | 版本              | 說明                  |
| ------------------- | ----------------- | --------------------- |
| Claude Code CLI     | 最新版            | 必要                  |
| .NET SDK            | 8.0 / 9.0 / 10.0 | 三個版本的練習專案     |
| Node.js             | 最新版            | 必要：skills-doctor、install-hooks.js、token-usage 引擎皆需要 |

**整合測試 / Aspire 測試額外需要：**

| 工具                    | 版本   | 說明                         |
| ----------------------- | ------ | ---------------------------- |
| Docker Desktop          | 最新版 | Testcontainers 容器執行環境  |
| .NET Aspire workload    | 最新版 | Aspire 測試專用              |

安裝 .NET Aspire workload：

```bash
dotnet workload install aspire
```

---

## 安裝與環境設定

### 方式 A：VS Code Extension（推薦）

1. 到 [dotnet-testing-agent-vscode-extensions Releases](https://github.com/kevintsengtw/dotnet-testing-agent-vscode-extensions/releases) 下載最新版 `.vsix` 並安裝
2. 在 VS Code 命令面板執行「初始化 Claude 模式」

執行後會自動部署：

- `.claude/`：`agents/`（16 個 subagent 定義）、`hooks/`（計時 hook）、`skills/`（5 個 Claude 專屬 skills：`dotnet-test` + 4 個 orchestrator）、`scripts/`（skill registry、skills-doctor、token-usage 引擎）
- `.agents/skills/`：29 個共用技術 Skills

---

### 方式 B：手動部署

#### 步驟 1：Clone 儲存庫

```bash
git clone https://github.com/kevintsengtw/dotnet-testing-agent-orchestration-claude.git
cd dotnet-testing-agent-orchestration-claude
```

#### 步驟 2：複製部署目標

必須逐項複製以下五個目標，一個都不能少：

| 目標 | 內容 | 來源 |
| --- | --- | --- |
| `.claude/agents/` | 16 個 subagent 定義 | 本 repo |
| `.claude/hooks/` | 計時 hook + `install-hooks.js` | 本 repo |
| `.claude/skills/` | 5 個：`dotnet-test` + 4 個 orchestrator | 本 repo |
| `.claude/scripts/` | skill registry、skills-doctor、token-usage 引擎（**最容易漏，漏了會讓 token 用量功能與 doctor 失效**） | 本 repo |
| `.agents/skills/` | 29 個共用技術 Skills（canonical location：`.agents/skills/<skill-name>/SKILL.md`） | [kevintsengtw/dotnet-testing-agent-skills](https://github.com/kevintsengtw/dotnet-testing-agent-skills) |

```bash
mkdir -p /your-project/.claude
cp -r .claude/agents/.  /your-project/.claude/agents/
cp -r .claude/hooks/.   /your-project/.claude/hooks/
cp -r .claude/skills/.  /your-project/.claude/skills/
cp -r .claude/scripts/. /your-project/.claude/scripts/

TMP_DIR=$(mktemp -d)
git clone https://github.com/kevintsengtw/dotnet-testing-agent-skills.git "$TMP_DIR/dotnet-testing-agent-skills"
mkdir -p /your-project/.agents/skills
cp -r "$TMP_DIR/dotnet-testing-agent-skills/skills/dotnet-testing"* /your-project/.agents/skills/
rm -rf "$TMP_DIR"
```

> `dotnet-testing-agent-skills` 的 `skills/` 目錄除了這 29 個 `dotnet-testing-*` 之外，還有 `README.md` 與 `skill-creator-advanced/`，兩者**不屬於**本工作流程的共用技術 Skill。上面的指令以 `dotnet-testing*` 前綴過濾，只複製需要的 29 個；請勿改用 `cp -r .../skills/.` 整個目錄複製。萬用字元後也不要補上 `/`——macOS／BSD 的 `cp` 遇到帶尾斜線的來源會改為複製「目錄內容」，29 個 Skill 會被平攤合併成一份。

Writer / Reviewer subagent 以固定路徑 `.agents/skills/<name>/SKILL.md` 用 Read 工具直接載入，**不需要**在 `.claude/skills` 建立連結。4 個 Orchestrator Skill 與 `dotnet-test` 屬 **Claude 專屬 Skill**，直接位於 `.claude/skills/`，不經 `.agents/skills`。完整規則見 [docs/SKILL_LAYOUT.md](docs/SKILL_LAYOUT.md)。

部署完成後，`.agents/skills/` 目錄下應有以下 29 個共用技術 Skill 目錄：

```text
dotnet-testing/
dotnet-testing-advanced/
dotnet-testing-advanced-aspire-testing/
dotnet-testing-advanced-aspnet-integration-testing/
dotnet-testing-advanced-testcontainers-database/
dotnet-testing-advanced-testcontainers-nosql/
dotnet-testing-advanced-tunit-advanced/
dotnet-testing-advanced-tunit-fundamentals/
dotnet-testing-advanced-webapi-integration-testing/
dotnet-testing-advanced-xunit-upgrade-guide/
dotnet-testing-autodata-xunit-integration/
dotnet-testing-autofixture-basics/
dotnet-testing-autofixture-bogus-integration/
dotnet-testing-autofixture-customization/
dotnet-testing-autofixture-nsubstitute-integration/
dotnet-testing-awesome-assertions-guide/
dotnet-testing-bogus-fake-data/
dotnet-testing-code-coverage-analysis/
dotnet-testing-complex-object-comparison/
dotnet-testing-datetime-testing-timeprovider/
dotnet-testing-filesystem-testing-abstractions/
dotnet-testing-fluentvalidation-testing/
dotnet-testing-nsubstitute-mocking/
dotnet-testing-private-internal-testing/
dotnet-testing-test-data-builder-pattern/
dotnet-testing-test-naming-conventions/
dotnet-testing-test-output-logging/
dotnet-testing-unit-test-fundamentals/
dotnet-testing-xunit-project-setup/
```

每個 Skill 目錄內含 `SKILL.md`（部分含 `references/` 與 `templates/` 子目錄）。

#### 步驟 3：確認完整目錄結構

完成步驟 1（Clone）與步驟 2（複製部署目標）後，完整預期結構如下。共用技術 Skills 位於 `.agents/skills/`（subagent 以固定路徑直接載入）；`.claude/skills/` 只放 4 個 orchestrator 與 `dotnet-test`：

```text
.claude/
├── agents/                                                  ← 本 repo 內建（16 個）
│   ├── dotnet-testing-analyzer.md                            Unit 組
│   ├── dotnet-testing-writer.md
│   ├── dotnet-testing-executor.md
│   ├── dotnet-testing-reviewer.md
│   ├── dotnet-testing-advanced-integration-analyzer.md       Integration 組
│   ├── dotnet-testing-advanced-integration-writer.md
│   ├── dotnet-testing-advanced-integration-executor.md
│   ├── dotnet-testing-advanced-integration-reviewer.md
│   ├── dotnet-testing-advanced-aspire-analyzer.md             Aspire 組
│   ├── dotnet-testing-advanced-aspire-writer.md
│   ├── dotnet-testing-advanced-aspire-executor.md
│   ├── dotnet-testing-advanced-aspire-reviewer.md
│   ├── dotnet-testing-advanced-tunit-analyzer.md              TUnit 組
│   ├── dotnet-testing-advanced-tunit-writer.md
│   ├── dotnet-testing-advanced-tunit-executor.md
│   └── dotnet-testing-advanced-tunit-reviewer.md
├── hooks/                                                   ← 本 repo 內建
│   ├── dotnet-testing-agent-timer-pre.sh
│   ├── dotnet-testing-agent-timer-post.sh
│   └── install-hooks.js
├── skills/                                                ← Claude 專屬 Skill（5 個）
│   ├── dotnet-test/
│   ├── dotnet-testing-orchestrator-unit/
│   ├── dotnet-testing-orchestrator-integration/
│   ├── dotnet-testing-orchestrator-aspire/
│   └── dotnet-testing-orchestrator-tunit/
└── scripts/
    ├── skills/                                             ← Skill registry + doctor validator
    └── token-usage/                                        ← token 用量引擎

.agents/
└── skills/                                                 ← 共用技術 Skills 的 canonical 來源（29 個）
    ├── dotnet-testing/                                     ← subagent 以固定路徑直接載入
    ├── dotnet-testing-advanced/
    ├── dotnet-testing-advanced-aspire-testing/
    ├── dotnet-testing-advanced-aspnet-integration-testing/
    ├── dotnet-testing-advanced-testcontainers-database/
    ├── dotnet-testing-advanced-testcontainers-nosql/
    ├── dotnet-testing-advanced-tunit-advanced/
    ├── dotnet-testing-advanced-tunit-fundamentals/
    ├── dotnet-testing-advanced-webapi-integration-testing/
    ├── dotnet-testing-advanced-xunit-upgrade-guide/
    ├── dotnet-testing-autodata-xunit-integration/
    ├── dotnet-testing-autofixture-basics/
    ├── dotnet-testing-autofixture-bogus-integration/
    ├── dotnet-testing-autofixture-customization/
    ├── dotnet-testing-autofixture-nsubstitute-integration/
    ├── dotnet-testing-awesome-assertions-guide/
    ├── dotnet-testing-bogus-fake-data/
    ├── dotnet-testing-code-coverage-analysis/
    ├── dotnet-testing-complex-object-comparison/
    ├── dotnet-testing-datetime-testing-timeprovider/
    ├── dotnet-testing-filesystem-testing-abstractions/
    ├── dotnet-testing-fluentvalidation-testing/
    ├── dotnet-testing-nsubstitute-mocking/
    ├── dotnet-testing-private-internal-testing/
    ├── dotnet-testing-test-data-builder-pattern/
    ├── dotnet-testing-test-naming-conventions/
    ├── dotnet-testing-test-output-logging/
    ├── dotnet-testing-unit-test-fundamentals/
    └── dotnet-testing-xunit-project-setup/
```

> 安裝步驟 4（計時 Hook）完成後，會新增 `.claude/settings.json`。

#### 步驟 4：安裝計時 Hook（可選）

```bash
node .claude/hooks/install-hooks.js
```

Hook 會自動記錄每個 Subagent 的執行耗時，執行後設定寫入 `.claude/settings.json`。未安裝時 Orchestrator 仍可正常運作，只是不會顯示耗時資訊。

#### 步驟 5：驗證安裝

```bash
node .claude/scripts/skills/skills-doctor.js
ls -d .agents/skills/*/ | wc -l    # 應為 29
```

離開碼 0 代表五個部署目標齊備。數量不是 29 代表步驟 2 多複製了 `dotnet-testing-*` 以外的目錄（doctor 只檢查該有的 29 個是否到位，不會因多餘目錄報錯）。接著在 Claude Code 中輸入以下任一指令，確認斜線指令可用：

```text
/dotnet-testing-orchestrator-unit
/dotnet-testing-orchestrator-integration
/dotnet-testing-orchestrator-aspire
/dotnet-testing-orchestrator-tunit
```

> 完整安裝說明與常見問題排查，請參閱 [docs/SETUP.md](docs/SETUP.md)

---

## 快速開始

在 Claude Code 內輸入對應指令，並提供目標資訊即可啟動工作流程。

**單元測試：**

```text
/dotnet-testing-orchestrator-unit

目標：src/Services/OrderService.cs
說明：訂單服務，依賴 IOrderRepository 和 INotificationService
```

**整合測試：**

```text
/dotnet-testing-orchestrator-integration

目標：Controllers/OrdersController.cs
資料庫：PostgreSQL
說明：訂單 CRUD API 整合測試
```

**Aspire 測試：**

```text
/dotnet-testing-orchestrator-aspire

目標：AppHost/AppHost.csproj
說明：電商平台的 Aspire 分散式應用整合測試
```

**TUnit 測試：**

```text
/dotnet-testing-orchestrator-tunit

目標：src/Services/CalculationService.cs
說明：純函式計算服務，使用 TUnit 框架
```

---

## 四種測試工作流程

| 工作流程 | 觸發指令 | 適用場景 | 必要環境 | 詳細說明 |
|---------|---------|---------|---------|---------|
| 單元測試 | `/dotnet-testing-orchestrator-unit` | xUnit + Mock + AutoFixture | .NET SDK | [使用指南](docs/guides/unit-testing.md) |
| 整合測試 | `/dotnet-testing-orchestrator-integration` | WebAPI + Testcontainers | .NET SDK + Docker | [使用指南](docs/guides/integration-testing.md) |
| Aspire 測試 | `/dotnet-testing-orchestrator-aspire` | 分散式應用 | .NET SDK + Docker + Aspire | [使用指南](docs/guides/aspire-testing.md) |
| TUnit 測試 | `/dotnet-testing-orchestrator-tunit` | TUnit 框架 / xUnit 遷移 | .NET SDK | [使用指南](docs/guides/tunit-testing.md) |

---

## 練習專案

每組練習專案皆提供 net8.0 / net9.0 / net10.0 三個版本。

| 測試類型    | 目錄                                        | 支援版本                  | 說明         |
| ----------- | ------------------------------------------- | ------------------------- | ------------ |
| 單元測試    | `samples/unit/practice/`                    | net8.0 / net9.0 / net10.0 | 6 個學習階段 |
| 整合測試    | `samples/integration/practice_integration/` | net8.0 / net9.0 / net10.0 | 5 個驗證情境 |
| Aspire 測試 | `samples/aspire/practice_aspire/`           | net8.0 / net9.0 / net10.0 | 4 個驗證階段 |
| TUnit 測試  | `samples/tunit/practice_tunit/`             | net8.0 / net9.0 / net10.0 | 5 個學習階段 |

> **注意：** `samples/*/tests/` 目錄下的測試專案為初始空白狀態，由 Orchestrator 工作流程產生內容。工作流程執行過程中產生的測試類別檔案與 `.csproj` 修改**不得 commit 或推送至遠端**，以維持練習環境的初始狀態。

---

## 文件

> 完整文件請參閱 [docs/README.md](docs/README.md)

- 安裝說明：[docs/SETUP.md](docs/SETUP.md)
- 架構總覽：[docs/architecture/overview.md](docs/architecture/overview.md)
- 使用指南：[docs/guides/](docs/guides/)
