# 架構總覽

- [架構總覽](#架構總覽)
  - [1. 設計理念](#1-設計理念)
    - [Agent Orchestration](#agent-orchestration)
    - [為何 Orchestrator 使用 Skill 而非 Agent](#為何-orchestrator-使用-skill-而非-agent)
    - [bypassPermissions 設計](#bypasspermissions-設計)
    - [計時 Hook 設計](#計時-hook-設計)
  - [2. 系統架構圖](#2-系統架構圖)
  - [3. Agent 分組](#3-agent-分組)
  - [4. 標準工作流程](#4-標準工作流程)
  - [5. 執行循序圖](#5-執行循序圖)
  - [6. 關鍵設計決策](#6-關鍵設計決策)

---

## 1. 設計理念

### Agent Orchestration

Agent Orchestration 是一種多 AI 代理協作模式：由一個「指揮者」（Orchestrator）統籌協調多個「執行者」（Subagent），各司其職地完成複雜任務。

在本 repo 的架構中：

- **Orchestrator**：負責任務拆解、順序協調與結果整合，本身不撰寫任何測試程式碼
- **Subagent**：接受 Orchestrator 委派，專注執行單一職責（分析 / 撰寫 / 執行 / 審查）

這種分工讓每個 Subagent 的 context 保持精簡，避免單一 agent 因 context 過長導致品質下降。

### 為何 Orchestrator 使用 Skill 而非 Agent

Claude Code 的 Agent tool 必須在**主對話（main thread）**中才能呼叫。若 Orchestrator 本身定義為 Agent，它在子對話中執行，無法再對外委派其他 Subagent。

因此，本架構選擇將 Orchestrator 定義為 **Skill**：

- Skill 透過斜線指令（如 `/dotnet-testing-orchestrator-unit`）載入主對話的 context
- 主對話載入 Skill 後，使用自身的 Agent tool 依序委派四個 Subagent
- 每個 Subagent 的定義檔（`.claude/agents/*.md`）由 Agent tool 自動載入

### bypassPermissions 設計

每個 Subagent 的定義檔中設定 `bypassPermissions: true`。

Executor Subagent 在執行 `dotnet build` 和 `dotnet test` 時，若沒有此設定，Claude Code 會在每次 Bash 工具呼叫前彈出手動確認提示。設定 `bypassPermissions: true` 後，Subagent 在其工作範圍內可自主執行這些指令，避免中斷工作流程。

### 計時 Hook 設計

`.claude/hooks/` 下設有兩個 Bash 腳本：`dotnet-testing-agent-timer-pre.sh`（PreToolUse）和 `dotnet-testing-agent-timer-post.sh`（PostToolUse）。

這兩個 Hook 攔截所有 `subagent_type` 以 `dotnet-testing-` 開頭的 Agent tool 呼叫：

- **PreToolUse**：記錄 Subagent 開始時間，並注入 `additionalContext`（`⏱ {subagent_type} 開始：HH:MM:SS`）
- **PostToolUse**：計算耗時，注入完成時間與持續秒數（`⏱ {subagent_type} 完成：HH:MM:SS（開始：HH:MM:SS，耗時 M 分 S 秒）`）

Hook 與 Orchestrator Skill 邏輯完全解耦：Orchestrator 不需要手動呼叫 `Bash(date)`，時間資訊自動出現在 Agent tool 的回傳結果中。若 Hook 未安裝，工作流程仍可正常執行，僅缺少耗時顯示。

---

## 2. 系統架構圖

```mermaid
graph TD
    Dev[👤 開發人員] -->|輸入斜線指令| Skill[📋 Orchestrator Skill\n主對話 context]

    subgraph hooks [⏱ PreToolUse / PostToolUse Hook]
        direction LR
        H1[記錄開始時間]
        H2[計算耗時並注入]
    end

    subgraph pipeline [四階段 Subagent 流水線]
        direction TD
        AN[🔍 Analyzer Subagent\ndotnet-testing-analyzer]
        WR[✍️ Writer Subagent\ndotnet-testing-writer]
        EX[⚙️ Executor Subagent\ndotnet-testing-executor]
        RV[📋 Reviewer Subagent\ndotnet-testing-reviewer]
        AN --> WR --> EX --> RV
    end

    subgraph external [📚 外部 Agent Skills\ndotnet-testing-agent-skills]
        AS1[autofixture-*]
        AS2[nsubstitute-*]
        AS3[awesomeassertions-*]
        AS4[其他技術技能]
    end

    Skill -->|委派，觸發 Hook| pipeline
    hooks -.->|時間注入至 additionalContext| Skill

    AN & WR & RV -->|按需載入| external
    EX -->|執行| DT[dotnet build / dotnet test]
```

---

## 3. Agent 分組

4 組 Orchestrator 各自管轄 4 個專屬 Subagent（16 個 Agent 定義檔）。

```mermaid
graph LR
    subgraph unit [Unit 單元測試]
        direction TB
        U_AN[dotnet-testing-analyzer]
        U_WR[dotnet-testing-writer]
        U_EX[dotnet-testing-executor]
        U_RV[dotnet-testing-reviewer]
    end

    subgraph integration [Integration 整合測試]
        direction TB
        I_AN[dotnet-testing-advanced-integration-analyzer]
        I_WR[dotnet-testing-advanced-integration-writer]
        I_EX[dotnet-testing-advanced-integration-executor]
        I_RV[dotnet-testing-advanced-integration-reviewer]
    end

    subgraph aspire [Aspire 測試]
        direction TB
        A_AN[dotnet-testing-advanced-aspire-analyzer]
        A_WR[dotnet-testing-advanced-aspire-writer]
        A_EX[dotnet-testing-advanced-aspire-executor]
        A_RV[dotnet-testing-advanced-aspire-reviewer]
    end

    subgraph tunit [TUnit 測試]
        direction TB
        T_AN[dotnet-testing-advanced-tunit-analyzer]
        T_WR[dotnet-testing-advanced-tunit-writer]
        T_EX[dotnet-testing-advanced-tunit-executor]
        T_RV[dotnet-testing-advanced-tunit-reviewer]
    end

    ORC_U[Orchestrator Skill\ndotnet-testing-orchestrator-unit] --> unit
    ORC_I[Orchestrator Skill\ndotnet-testing-orchestrator-integration] --> integration
    ORC_A[Orchestrator Skill\ndotnet-testing-orchestrator-aspire] --> aspire
    ORC_T[Orchestrator Skill\ndotnet-testing-orchestrator-tunit] --> tunit
```

| 組別 | Orchestrator Skill | Analyzer | Writer | Executor | Reviewer |
|------|-------------------|----------|--------|----------|----------|
| Unit | `dotnet-testing-orchestrator-unit` | `dotnet-testing-analyzer` | `dotnet-testing-writer` | `dotnet-testing-executor` | `dotnet-testing-reviewer` |
| Integration | `dotnet-testing-orchestrator-integration` | `dotnet-testing-advanced-integration-analyzer` | `dotnet-testing-advanced-integration-writer` | `dotnet-testing-advanced-integration-executor` | `dotnet-testing-advanced-integration-reviewer` |
| Aspire | `dotnet-testing-orchestrator-aspire` | `dotnet-testing-advanced-aspire-analyzer` | `dotnet-testing-advanced-aspire-writer` | `dotnet-testing-advanced-aspire-executor` | `dotnet-testing-advanced-aspire-reviewer` |
| TUnit | `dotnet-testing-orchestrator-tunit` | `dotnet-testing-advanced-tunit-analyzer` | `dotnet-testing-advanced-tunit-writer` | `dotnet-testing-advanced-tunit-executor` | `dotnet-testing-advanced-tunit-reviewer` |

---

## 4. 標準工作流程

```mermaid
flowchart TD
    Start([開始]) --> P0[Phase 0\n清理殘留 .orchestrator/ 目錄]
    P0 --> P1[Phase 1：Analyzer\n分析被測試目標\n產出 analysis.json]
    P1 --> P2[Phase 2：Writer\n一個被測類別一個 Writer\n產出單一測試檔案]

    P2 --> P3[Phase 3：Executor\ndotnet build\ndotnet test]

    P3 --> ExecCheck{全部通過？}
    ExecCheck -- 否，修正並重試\n最多 3 輪 --> P3
    ExecCheck -- 是 --> P4[Phase 4：Reviewer\n審查測試品質\n產出評分與建議]

    P4 --> ReviewCheck{有修正建議\n且使用者同意套用？}
    ReviewCheck -- 否 --> P5[Phase 5\n清理 executor-result/ 暫存\n保留 analysis/ 供量測工具]
    ReviewCheck -- 是 --> Mod[修改流程\nWriter 修改 → Executor 執行 → Reviewer 複審]
    Mod --> P5

    P5 --> End([完成])
```

---

## 5. 執行循序圖

```mermaid
sequenceDiagram
    actor Dev as 👤 開發人員
    participant Main as 主對話
    participant Skill as Orchestrator Skill
    participant Hook as ⏱ 計時 Hook
    participant AN as Analyzer
    participant WR as Writer
    participant EX as Executor
    participant RV as Reviewer

    Dev->>Main: /dotnet-testing-orchestrator-unit\n「為 ProductService 撰寫單元測試」
    Main->>Skill: 載入 Skill context
    Skill->>Skill: Phase 0：Glob 檢查殘留 .orchestrator/

    Note over Skill,Hook: 委派 Analyzer
    Skill->>Hook: PreToolUse（Agent tool 呼叫前）
    Hook-->>Skill: ⏱ Analyzer 開始：HH:MM:SS
    Skill->>AN: Agent(dotnet-testing-analyzer, prompt)
    AN-->>Skill: 分析摘要 + analysis.json 路徑
    Skill->>Hook: PostToolUse（Agent tool 呼叫後）
    Hook-->>Skill: ⏱ Analyzer 完成（耗時 M 分 S 秒）

    Note over Skill,Hook: 委派 Writer
    Skill->>Hook: PreToolUse
    Hook-->>Skill: ⏱ Writer 開始：HH:MM:SS
    Skill->>WR: Agent(dotnet-testing-writer, analysisFilePath + 輸出路徑)
    WR-->>Skill: 測試檔案路徑 + testCount
    Skill->>Hook: PostToolUse
    Hook-->>Skill: ⏱ Writer 完成（耗時 M 分 S 秒）

    Note over Skill,Hook: 委派 Executor
    Skill->>Hook: PreToolUse
    Hook-->>Skill: ⏱ Executor 開始：HH:MM:SS
    Skill->>EX: Agent(dotnet-testing-executor, 測試專案路徑 + 交接檔案路徑)
    EX->>EX: dotnet build
    EX->>EX: dotnet test
    EX-->>Skill: 通過數 / 失敗數 / 修正輪次
    Skill->>Hook: PostToolUse
    Hook-->>Skill: ⏱ Executor 完成（耗時 M 分 S 秒）

    Note over Skill,Hook: 委派 Reviewer
    Skill->>Hook: PreToolUse
    Hook-->>Skill: ⏱ Reviewer 開始：HH:MM:SS
    Skill->>RV: Agent(dotnet-testing-reviewer, 測試檔案路徑 + 三個交接檔案路徑)
    RV-->>Skill: 評分 + issues + 改善建議
    Skill->>Hook: PostToolUse
    Hook-->>Skill: ⏱ Reviewer 完成（耗時 M 分 S 秒）

    Skill->>Skill: Phase 5：清理 executor-result/ 暫存
    Skill->>Main: 整合結果 + 各階段耗時表格
    Main->>Dev: 呈現結果
```

---

## 6. 關鍵設計決策

| 設計選擇 | 決策 | 原因 |
|---------|------|------|
| Orchestrator 載體 | Skill（非 Agent） | Skill 在主對話中執行，才能透過 Agent tool 委派 Subagent；若定義為 Agent 則身處子對話，無法再對外委派 |
| 執行權限 | `bypassPermissions: true` | 避免每次 `dotnet build` / `dotnet test` 需要手動確認，確保工作流程自動推進 |
| 計時機制 | Hook（非 Bash date） | 與 Orchestrator 指令解耦，不佔用 Subagent 的 context；Hook 未安裝時流程仍可正常執行 |
| 大型類別處理 | 單一 Writer | 一個被測類別固定一個 Writer、一個測試檔案。早期版本會在方法數 > 5 或情境數 > 20 時拆為兩個平行 Writer，因平行 Writer 無法協調、跨檔寫法必然漂移而移除 |
| 技能載入方式 | 動態載入 Agent Skills | Analyzer 依分析結果決定 Writer 需要哪些技能（AutoFixture / NSubstitute / AwesomeAssertions 等），按需載入，避免無謂的 context 佔用 |
| 交接機制 | JSON 檔案（.orchestrator/） | Subagent 間透過 `.orchestrator/analysis/*.analysis.json` 傳遞結構化資料，而非在 prompt 中嵌入完整內容，保持每個 Subagent 的 prompt 精簡 |
| 清理策略 | 保留 analysis/，刪除 executor-result/ | analysis.json 供外部量測工具（benchmark-token.ps1）讀取；executor-result/ 為暫存資料，每次流程結束後清理 |
