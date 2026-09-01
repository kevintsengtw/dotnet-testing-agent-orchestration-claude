# 安裝與環境設定

本文件提供完整的安裝步驟與常見問題解決。根目錄 README.md 提供簡版安裝說明，本文提供更完整的設定指南。

---

## 目錄

1. [系統需求](#1-系統需求)
2. [安裝步驟](#2-安裝步驟)
3. [常見問題排查](#3-常見問題排查)

---

## 1. 系統需求

### 必要

| 項目                | 說明                                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| **Claude Code CLI** | 最新版本（[安裝指南](https://code.claude.com/docs/en/getting-started)） |
| **.NET SDK**        | 支援 net8.0 / net9.0 / net10.0，至少安裝一個版本                        |
| **Node.js**         | 用於安裝 Agent Skills（`npx skills install`）                           |

### 整合測試 / Aspire 測試額外需要

| 項目                     | 適用測試類型        | 說明                                                 |
| ------------------------ | ------------------- | ---------------------------------------------------- |
| **Docker Desktop**       | Integration、Aspire | Testcontainers / Aspire 容器編排需要，且必須在執行中 |
| **.NET Aspire workload** | Aspire              | 僅 Aspire 測試需要                                   |

### 驗證必要工具已安裝

```bash
claude --version
dotnet --list-sdks
node --version
docker --version
dotnet workload list  # 確認 aspire 已安裝（Aspire 測試才需要）
```

---

## 2. 安裝步驟

### 步驟 1：Clone 儲存庫

```bash
git clone https://github.com/kevintsengtw/dotnet-testing-agent-orchestration-claude.git
cd dotnet-testing-agent-orchestration-claude
```

### 步驟 2：安裝 Agent Skills（dotnet-testing-agent-skills）

外部 Agent Skills 提供各種 .NET 測試技術的知識庫（AutoFixture、NSubstitute、Testcontainers 等），需從 [dotnet-testing-agent-skills](https://github.com/kevintsengtw/dotnet-testing-agent-skills) repo 安裝。

```bash
npx skills install dotnet-testing-agent-skills
```

安裝完成後，Skills 會安裝到 Claude Code 的使用者 Skills 目錄，供所有使用 Claude Code 的專案共用。

**驗證安裝**：在 Claude Code 對話中輸入 `/`，確認清單中可看到 `dotnet-testing-autofixture-basics`、`dotnet-testing-nsubstitute-mocking` 等 Skills 已可用。

### 步驟 3：確認完整 .claude/ 目錄結構

完成步驟 1（Clone）與步驟 2（安裝 Agent Skills）後，`.claude/` 的完整預期結構如下：

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
│
├── hooks/                                                   ← 本 repo 內建
│   ├── dotnet-testing-agent-timer-pre.sh
│   ├── dotnet-testing-agent-timer-post.sh
│   └── install-hooks.js
│
└── skills/
    │
    │   ── 本 repo 內建（5 個）──────────────────────────────
    ├── dotnet-test/                                           .NET 測試執行器
    │   ├── SKILL.md
    │   └── references/
    │       ├── blame-mode.md
    │       ├── parallel-execution.md
    │       └── theory-parameter-filtering.md
    ├── dotnet-testing-orchestrator-unit/
    │   └── SKILL.md
    ├── dotnet-testing-orchestrator-integration/
    │   └── SKILL.md
    ├── dotnet-testing-orchestrator-aspire/
    │   └── SKILL.md
    ├── dotnet-testing-orchestrator-tunit/
    │   └── SKILL.md
    │
    │   ── dotnet-testing-agent-skills 安裝後新增（29 個）───
    ├── dotnet-testing/
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

> **注意**：步驟 4（安裝計時 Hook）完成後，會新增 `.claude/settings.json`，其中包含 `hooks` 設定區段。

### 步驟 4：安裝計時 Hook（可選）

計時 Hook 會在每個 Subagent 執行前後自動追蹤耗時，並將時間資訊注入到 Claude 的 context 中，方便了解工作流程的效能。未安裝不影響核心測試工作流程的執行，僅缺少自動時間追蹤。

**自動安裝（推薦）：**

在 repo 根目錄執行：

```bash
node .claude/hooks/install-hooks.js
```

腳本會自動完成以下動作：

1. 複製 hook 腳本到 `.claude/hooks/`（`dotnet-testing-agent-timer-pre.sh`、`dotnet-testing-agent-timer-post.sh`）
2. 合併 hooks 設定到 `.claude/settings.json`（不覆寫既有設定，冪等設計）

**驗證 Hook 安裝：**

安裝後確認 `.claude/settings.json` 已包含 `hooks` 區段，結構如下：

```text
{
  "hooks": {
    "PreToolUse": [{ "matcher": "Agent", "hooks": [...] }],
    "PostToolUse": [{ "matcher": "Agent", "hooks": [...] }]
  }
}
```

Hook 只對 `subagent_type` 以 `dotnet-testing-` 開頭的 Agent 呼叫生效，其他 Agent 呼叫完全不受影響。

### 步驟 5：驗證安裝

啟動 Claude Code 後，在對話中輸入 `/` 確認以下斜線指令可用：

| 斜線指令                                   | 說明                          |
| ------------------------------------------ | ----------------------------- |
| `/dotnet-testing-orchestrator-unit`        | 觸發單元測試 Orchestrator     |
| `/dotnet-testing-orchestrator-integration` | 觸發整合測試 Orchestrator     |
| `/dotnet-testing-orchestrator-aspire`      | 觸發 Aspire 測試 Orchestrator |
| `/dotnet-testing-orchestrator-tunit`       | 觸發 TUnit 測試 Orchestrator  |

若以上指令出現在斜線指令清單中，表示安裝完成。

---

## 3. 常見問題排查

### 問題 1：Orchestrator 斜線指令無法使用

**症狀：** 輸入 `/dotnet-testing-orchestrator-*` 後沒有回應，或 `/` 清單中找不到對應指令。

**可能原因：** Skills 未正確載入，或 `.claude/skills/` 目錄結構不正確。

**解法：**

1. 確認 `.claude/skills/` 下各目錄有 `SKILL.md` 檔案
2. 確認目錄名稱完全吻合（如 `dotnet-testing-orchestrator-unit/`）
3. 重新啟動 Claude Code 讓 Skills 重新載入

---

### 問題 2：Agent Skills 未載入（Skill 找不到錯誤）

**症狀：** Orchestrator 執行時找不到 `dotnet-testing-autofixture-basics`、`dotnet-testing-nsubstitute-mocking` 等技能，Writer 產出的測試品質低落或未遵循最佳實踐。

**可能原因：** `dotnet-testing-agent-skills` 未安裝或版本過舊。

**解法：**

```bash
npx skills install dotnet-testing-agent-skills
```

重新安裝後，確認 `/` 清單中出現 `dotnet-testing-autofixture-*` 等 Skill。

---

### 問題 3：Docker 未啟動（整合測試 / Aspire 測試）

**症狀：** 執行 Integration 或 Aspire 測試時，Testcontainers 回報錯誤「Docker is not running」或 container 無法啟動。

**可能原因：** Docker Desktop 未執行。

**解法：**

啟動 Docker Desktop，等待 Docker Engine 就緒後再執行測試。可用以下指令確認 Docker 已正常運作：

```bash
docker ps
```

---

### 問題 4：Aspire workload 未安裝

**症狀：** Aspire 測試專案無法建置，`dotnet build` 回報找不到 Aspire 相關套件或 workload。

**解法：**

```bash
dotnet workload install aspire
```

安裝完成後再次確認：

```bash
dotnet workload list
```

確認輸出中包含 `aspire`。

---

### 問題 5：.NET SDK 版本不符

**症狀：** `dotnet build` 回報 SDK 版本不支援，或建置時出現 TFM 不相符的錯誤。

**解法：**

1. 確認已安裝對應版本的 .NET SDK（net8.0 / net9.0 / net10.0）：

```bash
dotnet --list-sdks
```

2. 若有 `global.json` 指定了特定 SDK 版本，確認該版本已安裝。從 [.NET 官方下載頁](https://dotnet.microsoft.com/download) 安裝缺少的版本。

---

### 問題 6：計時 Hook 未顯示耗時

**症狀：** Subagent 執行完畢後，沒有顯示 `⏱` 計時耗時訊息。

**可能原因：** Hook 未安裝，或 `.claude/settings.json` 的 `hooks` 設定不完整。

**解法：**

重新執行安裝腳本（冪等，安全重複執行）：

```bash
node .claude/hooks/install-hooks.js
```

執行後確認 `.claude/settings.json` 包含完整的 `PreToolUse` 與 `PostToolUse` hooks 設定。若 `settings.json` 已有其他設定，腳本只會合併 `hooks` 區段，不會覆寫既有設定。
