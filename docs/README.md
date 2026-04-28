# 文件導覽

## 快速導航

| 文件            | 說明                             | 連結                                                           |
| --------------- | -------------------------------- | -------------------------------------------------------------- |
| 安裝與環境設定  | 完整安裝步驟、系統需求、常見問題 | [SETUP.md](SETUP.md)                                           |
| 架構總覽        | 整體架構、Mermaid 圖、設計決策   | [architecture/overview.md](architecture/overview.md)           |
| 單元測試指南    | 指令範例、練習專案、工作流程細節 | [guides/unit-testing.md](guides/unit-testing.md)               |
| 整合測試指南    | Docker 環境、Testcontainers 情境 | [guides/integration-testing.md](guides/integration-testing.md) |
| Aspire 測試指南 | 分散式應用測試、AppHost Resource | [guides/aspire-testing.md](guides/aspire-testing.md)           |
| TUnit 測試指南  | TUnit 框架、xUnit 遷移           | [guides/tunit-testing.md](guides/tunit-testing.md)             |

## 架構文件

給想深入了解各 Orchestrator 實作細節的讀者。

| 文件                                                                    | 說明                                                                              |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [overview.md](architecture/overview.md)                                 | 整體架構圖（系統架構、Agent 分組、工作流程、循序圖）                              |
| [unit-orchestrator.md](architecture/unit-orchestrator.md)               | 單元測試 Orchestrator：Agent Skills、工作流程細節、分割策略                       |
| [integration-orchestrator.md](architecture/integration-orchestrator.md) | 整合測試 Orchestrator：Container 技術、生產程式碼修正授權                         |
| [aspire-orchestrator.md](architecture/aspire-orchestrator.md)           | Aspire 測試 Orchestrator：DistributedApplicationTestingBuilder、Resource 命名規則 |
| [tunit-orchestrator.md](architecture/tunit-orchestrator.md)             | TUnit 測試 Orchestrator：Source Generator 架構、xUnit 遷移檢查清單                |

## 使用指南

每份指南包含：前提條件、指令範例、練習專案說明、常見問題排查、工作流程細節。

| 文件                                                    | 觸發指令                                   | 必要環境                            |
| ------------------------------------------------------- | ------------------------------------------ | ----------------------------------- |
| [unit-testing.md](guides/unit-testing.md)               | `/dotnet-testing-orchestrator-unit`        | .NET SDK                            |
| [integration-testing.md](guides/integration-testing.md) | `/dotnet-testing-orchestrator-integration` | .NET SDK + Docker                   |
| [aspire-testing.md](guides/aspire-testing.md)           | `/dotnet-testing-orchestrator-aspire`      | .NET SDK + Docker + Aspire workload |
| [tunit-testing.md](guides/tunit-testing.md)             | `/dotnet-testing-orchestrator-tunit`       | .NET SDK                            |

## 從哪裡開始？

- **第一次使用** → 先看 [SETUP.md](SETUP.md) 完成安裝，再看 [guides/unit-testing.md](guides/unit-testing.md) 試跑第一個工作流程
- **想了解架構** → 看 [architecture/overview.md](architecture/overview.md) 的 Mermaid 圖
- **整合測試情境** → 確認 Docker 已啟動，看 [guides/integration-testing.md](guides/integration-testing.md)
- **TUnit 遷移** → 看 [guides/tunit-testing.md](guides/tunit-testing.md) 的「情境 4：xUnit 遷移」
