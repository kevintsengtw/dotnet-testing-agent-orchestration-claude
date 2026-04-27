# CLAUDE.md

## 專案概述

dotnet-testing Agent Orchestration for Claude Code。
提供完整的 Claude Code Subagents 測試工作流程範例，涵蓋 Unit / Integration / Aspire / TUnit 四種測試類型。

## 語言與風格

- 對話、文件、commit message 使用繁體中文
- commit message 格式：`動詞: 描述`（如 `更新:`, `重構:`, `修正:`）
- 測試方法命名：中文三段式 `方法名_情境描述_預期結果`
- 語氣直接，不用敬語（不用「請」「麻煩」）
- Markdown fenced code block 必須加語言標記（`text`、`bash`、`csharp`）

## 關鍵目錄

- `.claude/agents/` — 16 個自訂 Agent 定義檔（4 組 orchestrator × 4 角色）
- `.claude/skills/` — 5 個 Skills（`dotnet-test` 測試執行器 + 4 個 Orchestrator Skills）
- `.claude/hooks/` — 計時 Hook（PreToolUse / PostToolUse）+ 安裝腳本

> Agent Skills（`dotnet-testing-*`）由外部 repo [`dotnet-testing-agent-skills`](https://github.com/kevintsengtw/dotnet-testing-agent-skills) 提供，需另行安裝。

## 專案結構

每組練習專案皆提供 net8.0 / net9.0 / net10.0 三個版本（以子專案形式存在於同一目錄內）。

| 目錄 | 類型 | 說明 |
| --- | --- | --- |
| `samples/unit/practice/` | 單元測試 | xUnit + NSubstitute + AutoFixture |
| `samples/integration/practice_integration/` | 整合測試 | WebApplicationFactory + Testcontainers |
| `samples/aspire/practice_aspire/` | Aspire 測試 | DistributedApplicationTestingBuilder |
| `samples/tunit/practice_tunit/` | TUnit 測試 | TUnit 框架 |

## 常用指令

- `dotnet build samples/unit/practice/tests/Practice.Core.Tests/` — 建置單元測試
- `dotnet test samples/unit/practice/tests/Practice.Core.Tests/` — 執行單元測試

## 測試技術棧

xUnit 2.9 + NSubstitute + AutoFixture + AwesomeAssertions + Bogus + FakeTimeProvider + MockFileSystem

## 重要：Skills 說明

本 repo 內含的 Skills：

- `.claude/skills/dotnet-test/` — .NET 測試執行器（可直接修改）
- `.claude/skills/dotnet-testing-orchestrator-unit/SKILL.md`（可直接修改）
- `.claude/skills/dotnet-testing-orchestrator-integration/SKILL.md`（可直接修改）
- `.claude/skills/dotnet-testing-orchestrator-aspire/SKILL.md`（可直接修改）
- `.claude/skills/dotnet-testing-orchestrator-tunit/SKILL.md`（可直接修改）

Agent Skills（`dotnet-testing-autofixture-*`、`dotnet-testing-nsubstitute-*` 等）來自外部 repo，不在本 repo 管理範圍內。

## 重要：測試專案必須保持初始狀態

所有 `samples/*/tests/` 下的測試專案是供練習用的空白起點。
測試 subagent 工作流程時產生的測試類別檔案或 .csproj 修改**不得簽入或推送到遠端**。
