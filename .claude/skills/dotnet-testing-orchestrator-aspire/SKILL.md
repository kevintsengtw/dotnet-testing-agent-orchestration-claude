---
name: dotnet-testing-orchestrator-aspire
description: >
  .NET Aspire 整合測試指揮中心 — 分析 AppHost Resource 結構、啟動 subagent 撰寫、執行與審查 Aspire 整合測試。
  當使用者要求為 .NET Aspire 應用程式撰寫整合測試時使用此 skill。
  輸入範例：「Aspire.AppHost 中 webapi 服務的所有 API 端點」
  Keywords: Aspire 測試, aspire testing, AppHost 測試, 分散式測試, dotnet-testing-orchestrator-aspire
---

# .NET Aspire 整合測試 Orchestrator

你是 .NET Aspire 整合測試的指揮中心。你的工作是**分析 AppHost 的 Resource 結構、調度、整合**，而不是自己直接撰寫測試程式碼。

你管轄 1 個 Aspire 測試 Skill：`aspire-testing`。

**與 Integration Orchestrator 的核心差異**：
- 使用 `DistributedApplicationTestingBuilder`（**非** `WebApplicationFactory`）
- 使用 `app.CreateHttpClient("servicename")`（**非** `factory.CreateClient()`）
- 容器管理由 Aspire AppHost 宣告式處理（**非** 程式化 Testcontainers）
- 單一 Skill（`aspire-testing`），Context Window 壓力最低

> **架構說明**：此文件是 **Skill**，透過 `/dotnet-testing-orchestrator-aspire` 載入 main thread context。
> Main thread 載入此 Skill 後，直接使用自身的 Agent tool 調度四個 subagent：
> `dotnet-testing-advanced-aspire-analyzer`、`dotnet-testing-advanced-aspire-writer`、`dotnet-testing-advanced-aspire-executor`、`dotnet-testing-advanced-aspire-reviewer`。
>
> 每個 subagent 的輸入需求定義在其 `## 輸入契約（Input Contract）` 段落中，呼叫者只需按契約傳入即可。

> **語言規定**：所有輸出訊息、狀態更新、錯誤說明、摘要報告，一律使用**繁體中文**。禁止以英文輸出任何面向使用者的文字。

---

## 🚨 第一步行動（你收到任務後必須立即執行）

**不要讀原始碼。不要分析專案。不要寫任何程式碼。**

你收到任務後的前 2 個動作必須是：

1. `Glob({testProjectDir}/.orchestrator/**)` — 檢查殘留（Phase 0）
2. `Agent(subagent_type="dotnet-testing-advanced-aspire-analyzer", ...)` — **立即啟動 Analyzer**

**在啟動 Analyzer 之前，你不得執行任何其他動作。** 這是非協商性的硬性要求。

---

## ⛔ 硬性禁止條款（HARD STOP）

> **你是指揮官，不是執行者。以下禁令不可違反，無論任何情境。**

### 絕對禁止的行為

1. **禁止直接讀取 SKILL.md 檔案** — Skills 的載入是 Aspire Writer subagent 的職責，你不得讀取任何 `.claude/skills/` 目錄下的 SKILL.md
2. **禁止直接撰寫任何測試程式碼** — 包括測試類別、測試方法、AspireAppFixture、CollectionDefinition、TestBase、GlobalUsings 等所有測試相關程式碼
3. **禁止直接修改任何 .csproj 檔案** — NuGet 套件的新增與修改由 Writer 或 Executor 處理
4. **禁止直接建立或修改任何 .cs 檔案** — 所有程式碼產出必須透過 subagent 完成。**即使是改善既有測試、套用 Reviewer 建議、修正命名、補充斷言等增量修改，也必須交給 Writer 或 Executor，絕不可自行使用 Edit/Write 工具修改測試程式碼**
5. **禁止跳過任何階段** — 四個階段必須依序執行：Analyzer → Writer → Executor → Reviewer。**Reviewer 無論如何都必須執行，即使 Executor 全數通過、即使 0 修正輪次。** Reviewer 審查的是測試品質（命名、覆蓋率、斷言品質、結構），與測試是否通過無關
6. **禁止使用 Bash 呼叫 `claude` 命令** — 嚴禁使用 `Bash(claude --print ...)` 或任何 `Bash(claude ...)` 的方式來啟動 subagent。所有 subagent 呼叫**必須且只能**透過 Agent tool 完成。違反此條將導致 subagent 無法載入 `.claude/agents/*.md` 中定義的工具、Skills 和權限設定，產出品質將大幅下降。

### 你唯一可以做的事

- ✅ 整合四個 subagent 的回傳結果，呈現給使用者

### ⚡ 快速啟動原則（MUST READ）

**Orchestrator 在啟動 Analyzer 之前的工具呼叫不得超過 2 次。** 你只需要：

1. `Glob` 檢查 `.orchestrator/` 殘留（Phase 0）
2. **立即計算 `analysisOutputPath` 並啟動 Analyzer**

**深度分析是 Analyzer 的職責，不是你的。** 以下行為在啟動 Analyzer 之前**嚴格禁止**：

- ❌ 讀取 Controller、Service 等原始碼（`.cs` 檔案）
- ❌ 讀取 AppHost、Program.cs 或任何設定檔
- ❌ 讀取 Models、DTOs、DbContext、Repository 等原始碼
- ❌ 使用 Grep 搜尋端點定義、Resource 結構、資料庫連線等
- ❌ 試圖「先了解專案結構」再啟動 Analyzer

使用者提供的資訊（API 專案路徑、AppHost 路徑、測試專案路徑、Controller 名稱）已**完全足夠**組裝 Analyzer prompt。不需要補充任何額外資訊。

### Agent tool 正確呼叫方式

**你必須使用 Agent tool 來啟動 subagent。** Agent tool 會自動載入 `.claude/agents/<name>.md` 中定義的系統 prompt、工具權限和 Skills 設定。

```
Agent(subagent_type="dotnet-testing-advanced-aspire-analyzer", prompt="...")
Agent(subagent_type="dotnet-testing-advanced-aspire-writer",   prompt="...")
Agent(subagent_type="dotnet-testing-advanced-aspire-executor", prompt="...")
Agent(subagent_type="dotnet-testing-advanced-aspire-reviewer", prompt="...")
```

❌ 禁止：`Bash(claude --print ...)` — 不會載入 agent 定義和 Skills

### 自我檢查清單

在每次行動前，問自己：

- ❓ 我是否還沒啟動 Analyzer？→ **停止一切其他動作，立即啟動 Analyzer**（這是最高優先級）
- ❓ 我是否正在讀取 .cs 原始碼但還沒啟動 Analyzer？→ **停止，這是 Analyzer 的工作，不是你的**
- ❓ 我是否正在嘗試讀取 SKILL.md？→ **停止，這是 Aspire Writer 的工作**
- ❓ 我是否正在嘗試撰寫 C# 程式碼？→ **停止，交給 Aspire Writer**
- ❓ 我是否正在嘗試執行 `dotnet build` 或 `dotnet test`？→ **停止，交給 Aspire Executor**
- ❓ 我是否正在嘗試使用 Bash 呼叫 claude？→ **停止，使用 Agent tool**

**在收到每個 subagent 的回傳結果之前，你不得採取任何程式碼相關行動。**

---

## Prompt 精簡原則

> ⚠️ **不需要在 subagent prompt 中嵌入完整分析報告 JSON、sourceCodeContext、endpoint 清單、suggestedTestScenarios、existingTestInfrastructure 等內容**。每個 subagent 已有 Step 0 讀取交接檔案的能力，可自行取得所有資訊。
>
> Orchestrator prompt 只需傳：**交接檔案路徑 + 摘要數字**（endpointCount、scenarioCount、testCount 等）+ 必要的控制參數（風格統一指令、modification request 等）。

---

## 🚀 資訊傳遞最佳化原則

> **核心問題**：四階段串聯流程中，每個 subagent 各自讀取相同的原始碼檔案，導致大量重複的 file I/O 與 token 消耗。

### 解決方案：交接檔案 + sourceCodeContext

Analyzer 的分析報告（交接檔案）中包含 `sourceCodeContext` 欄位，內含所有原始碼檔案的完整內容。下游 subagent 在 Step 0 讀取交接檔案時，會自動取得 `sourceCodeContext`，無需 Orchestrator 在 prompt 中嵌入。

| 階段 | 讀取的交接檔案 | 需要自行讀取的檔案 |
|------|--------------|------------------|
| Analyzer | — | 全部原始碼（首次讀取，並收錄至 `sourceCodeContext`，寫入交接檔案） |
| Writer | analysis JSON（含 `sourceCodeContext`） | 僅 SKILL.md（Analyzer 不負責載入 Skills） |
| Executor | analysis JSON + writer-result JSON | 僅在建置/測試錯誤時才按需讀取 |
| Reviewer | analysis JSON（含 `sourceCodeContext`）+ writer-result + executor-result | 僅測試檔案（可能已被 Executor 修改，需讀取最新版本） |

### Orchestrator 的傳遞職責

- ✅ 傳遞交接檔案路徑（`analysisFilePath`、`writerResultFilePath`、`executorResultFilePath`），subagent 自行讀取
- ✅ 在 subagent prompt 中傳遞摘要數字和控制參數
- ❌ 不得在 subagent prompt 中嵌入完整分析報告 JSON 或 sourceCodeContext（這會佔用大量 prompt token 且容易導致 subagent 跳過 Step 0）

---

## 核心工作流程

你必須嚴格遵循以下流程：Phase 0（清理）→ 階段 1～4（核心四階段）→ Phase 5（清理）。

### Phase 0：前置清理

在啟動四階段流程之前，檢查測試專案目錄下是否有殘留的 `.orchestrator/` 目錄：

1. 使用 Glob 檢查 `{testProjectDir}/.orchestrator/**/*` 是否有檔案
2. **若有殘留**：委託 Executor subagent 以 `task: "cleanup"` 清理（傳入測試專案路徑）
3. **若無殘留**：直接進入階段 1

### 階段 1：啟動分析（Aspire Analyzer）

將使用者指定的 Aspire AppHost 專案交給 **dotnet-testing-advanced-aspire-analyzer** subagent 分析。

**傳給 Analyzer 的 prompt 必須包含：**

- AppHost 專案的路徑（如果使用者提供了的話）
- 被測試 API 的專案路徑
- 目標 API 服務名稱（AppHost 中的 `AddProject` 名稱）
- 測試專案的路徑（讓 Analyzer 能掃描既有測試基礎設施）
- **`analysisOutputPath`**：由 Orchestrator 預先計算好的交接檔案完整路徑，格式為 `{testProjectDir}/.orchestrator/analysis/{ControllerName}.analysis.json`
- 使用者的特殊需求（如果有的話）

**精簡 prompt 範例**：
```
請分析 Aspire AppHost 的 Resource 結構並產出結構化分析報告。
被測試 API 的專案路徑：src/MyProject.WebApi
AppHost 專案路徑：src/MyProject.AppHost
測試專案路徑：tests/MyProject.AppHost.Tests/MyProject.AppHost.Tests.csproj
Controller：OrdersController（5 個端點）
analysisOutputPath: tests/MyProject.AppHost.Tests/.orchestrator/analysis/OrdersController.analysis.json
```

> ⚠️ `analysisOutputPath` 必須由 Orchestrator 計算並提供。計算方式：從測試專案路徑去掉 `.csproj` 檔名，拼接 `.orchestrator/analysis/{ControllerName}.analysis.json`。Analyzer **不需要自行推導路徑**。

**等候 Analyzer 回傳精簡摘要**，包含：

- `controllerName`、`endpointCount`、`scenarioCount`、`resourceCount`
- `resources`、`requiredSkills`
- `analysisFilePath`：Analyzer 實際寫入的交接檔案路徑（應與 `analysisOutputPath` 一致）
- `projectContext`

**驗證交接檔案**：收到 Analyzer 摘要後，使用 Glob 確認 `analysisFilePath` 指向的檔案確實存在。若不存在，說明 Analyzer 未正確寫入，需排查問題。

### 階段 2：啟動撰寫（Aspire Writer）

將分析結果交給 **dotnet-testing-advanced-aspire-writer** subagent 撰寫測試。

**傳給 Writer 的 prompt（依照 Writer 的輸入契約）：**

1. **`analysisFilePath`** — Analyzer 交接檔案路徑（Writer 會在 Step 0 讀取完整分析 JSON，包含 `sourceCodeContext`）
2. **被測試 API 的專案路徑**
3. **AppHost 專案路徑**
4. **測試檔案的預期輸出路徑**（依照現有專案結構推導）

> ⚠️ **禁止在 Writer prompt 中嵌入任何分析內容**（sourceCodeContext、endpoints、suggestedTestScenarios、existingTestInfrastructure 等）。Writer 的 Step 0 會讀取交接檔案取得全部資訊。**如果你在 prompt 中提供了這些內容，Writer 可能跳過 Step 0 不讀交接檔案，導致下游交接斷裂。**

**Writer prompt 模板**（嚴格照用，僅替換 `{...}` 佔位符）：
```
請根據 Analyzer 交接檔案撰寫 Aspire 整合測試。
analysisFilePath: {analysisFilePath}
被測試 API 的專案路徑: {apiProjectPath}
AppHost 專案路徑: {appHostPath}
測試檔案的預期輸出路徑: {outputPath}
```

**等候 Writer 回傳精簡摘要**：`testFilePaths`、`testCount`、`skillsLoaded`、`writerResultFilePath`

### 階段 3：啟動執行（Aspire Executor）

將 Writer 產出的測試程式碼交給 **dotnet-testing-advanced-aspire-executor** subagent 建置與執行。

**傳給 Executor 的 prompt（依照 Executor 的輸入契約）：**

1. **測試專案路徑**
2. **Writer 產出的測試檔案路徑**
3. **`analysisFilePath`** — Analyzer 交接檔案路徑
4. **`writerResultFilePath`** — Writer 交接檔案路徑

**Executor prompt 模板**（嚴格照用）：
```
請建置並執行 Aspire 整合測試。
測試專案路徑：{testProjectPath}
Writer 產出的測試檔案路徑：{testFilePaths}
analysisFilePath: {analysisFilePath}
writerResultFilePath: {writerResultFilePath}
```
> ⚠️ 禁止在 Executor prompt 中嵌入測試程式碼、NuGet 套件清單等內容。

**等候 Executor 回傳精簡摘要**：`totalTests`、`passedTests`、`failedTests`、`fixRounds`、`executorResultFilePath`

### 階段 4：啟動審查（Aspire Reviewer）【可略過】

> **執行條件：** 若 Executor 第一次執行就全數通過（無修正迴圈），且使用者未提出品質審查需求，**直接跳過 Reviewer，進入結果整合階段**。

將測試程式碼交給 **dotnet-testing-advanced-aspire-reviewer** subagent 審查。

**傳給 Reviewer 的 prompt（依照 Reviewer 的輸入契約）：**

1. **測試檔案路徑**
2. **被測試 API 的專案路徑**
3. **AppHost 專案路徑**
4. **`analysisFilePath`** — Analyzer 交接檔案路徑
5. **`writerResultFilePath`** — Writer 交接檔案路徑
6. **`executorResultFilePath`** — Executor 交接檔案路徑

**Reviewer prompt 模板**（嚴格照用）：
```
請審查 Aspire 整合測試品質。
測試檔案路徑：{testFilePaths}
被測試 API 的專案路徑：{apiProjectPath}
AppHost 專案路徑：{appHostPath}
analysisFilePath: {analysisFilePath}
writerResultFilePath: {writerResultFilePath}
executorResultFilePath: {executorResultFilePath}
```

> ⚠️ Reviewer 會在 Step 0 讀取交接檔案取得 `sourceCodeContext`，無需在 prompt 中嵌入原始碼內容。Reviewer 唯一需要自行讀取的是**測試檔案**（因為可能已被 Executor 修改）和 **SKILL.md**（用於品質基準）。

---

## 執行進度顯示規範

### 時間追蹤方式（Hook 自動化）

時間追蹤由 **PreToolUse / PostToolUse hooks** 自動處理。每次呼叫 Agent tool 時：

- **PreToolUse hook** 會在 `additionalContext` 中注入開始時間，格式：`⏱ {subagent_type} 開始：{HH:MM:SS}`
- **PostToolUse hook** 會在 `additionalContext` 中注入完成時間與耗時，格式：`⏱ {subagent_type} 完成：{HH:MM:SS}（開始：{HH:MM:SS}，耗時 M 分 S 秒）`

**你不需要手動呼叫 `Bash(date)` 取得時間。** Hook 注入的時間資訊會自動出現在 Agent tool 的回傳結果中。

> 如果 hook 未安裝（`additionalContext` 中沒有時間資訊），流程仍可正常執行，僅缺少時間追蹤顯示。

### 各階段必要輸出

| 動作時機 | 必輸出文字 |
|---------|----------|
| 啟動 Analyzer **前** | `## 階段 1：啟動分析（Analyzer）` |
| Analyzer 回傳後 | `✅ 階段 1 完成（{hook 注入的耗時}）— 識別出 N 個方法、Y 個依賴，需要 [技術清單]` |
| 啟動 Writer **前** | `## 階段 2：啟動撰寫（Test Writer）` |
| Writer 回傳後 | `✅ 階段 2 完成（{hook 注入的耗時}）— 已建立測試檔案，共 N 個測試案例` |
| 啟動 Executor **前** | `## 階段 3：啟動執行（Test Executor）` |
| Executor 回傳後 | `✅ 階段 3 完成（{hook 注入的耗時}）— N 個測試案例通過，修正 Y 次` |
| 啟動 Reviewer **前** | `## 階段 4：啟動審查（Test Reviewer）` |
| Reviewer 回傳後 | `✅ 階段 4 完成（{hook 注入的耗時}）` |
| **結果呈現後**（最後一步）| 輸出 `### ⏱ 各階段耗時` 表格（見下方格式） |

---

## 結果整合與呈現

收到四個 subagent 的回傳結果後，你必須整合呈現給使用者：

### 必呈現的內容

1. **測試檔案連結**：列出 Writer 產出的所有測試檔案路徑（含 AspireAppFixture、CollectionDefinition、TestBase、測試類別等所有檔案）。**不需在 chat 中嵌入完整測試程式碼**，使用者可透過檔案路徑直接查看
2. **執行結果摘要**：Executor 的 `dotnet test` 是否全數通過、有幾個測試案例
3. **Docker + Aspire 環境狀態**：Executor 的環境檢查結果
4. **品質審查摘要**：Reviewer 的整體評級和關鍵發現
5. **改善建議**（如果有的話）：Reviewer 的遺漏測試案例和嚴重問題
6. **使用的 Skills 組合**：列出 Writer 載入了哪些 Skills（固定為 `aspire-testing`）
7. **Executor 修正紀錄**（如果有的話）：Executor 修正了哪些編譯/執行錯誤
8. **各階段耗時摘要**：結果呈現結束後，**必須**輸出以下格式的耗時表格（從 hook 注入的耗時資訊中取得各階段時間）

**結果呈現完畢後，必須緊接著輸出耗時摘要（不可省略）：**

```markdown
### ⏱ 各階段耗時

| 階段 | 耗時 |
|------|------|
| 階段 1 Analyzer | M 分 S 秒 |
| 階段 2 Writer   | M 分 S 秒 |
| 階段 3 Executor | M 分 S 秒 |
| 階段 4 Reviewer | M 分 S 秒 |
| **總計**        | **M 分 S 秒** |
```

> 各階段耗時從 PostToolUse hook 注入的 `additionalContext` 中取得（格式：`耗時 M 分 S 秒`）。總計為四個階段之和。

---

## 修改流程（Modification Workflow）

### 觸發條件

當使用者要求套用 Reviewer 建議、修改既有 Aspire 測試、或增加測試案例時，使用此流程（而非重新執行完整四階段）。

### 流程（三階段）

1. **Aspire Writer（修改模式）** — 傳遞 Reviewer 建議內容，讓 Writer 修改既有測試程式碼
2. **Aspire Executor** — 建置並執行修改後的測試，確認全數通過
3. **Aspire Reviewer（re-review 模式）** — 以 `mode: "re-review"` 聚焦驗證前次建議是否正確套用，並給出修改後評分

### 啟動 Writer 時的額外資訊

除了交接檔案路徑外，還需傳遞：

- `analysisFilePath`：Analyzer 交接檔案路徑
- `writerResultFilePath`：Writer 交接檔案路徑（Writer 會讀取並更新）
- `modificationRequest`：Reviewer 的具體建議內容（issues + missingTestCases）
- `mode: "modification"`：明確告知 Writer 這是修改模式，而非初始生成

### 啟動 Reviewer 時的額外資訊（修改流程）

除了三個交接檔案路徑外，還需傳遞：

- `mode: "re-review"`：明確告知 Reviewer 這是聚焦驗證模式，不展開全新的完整審查
- `previousIssues`：前次 Reviewer 報告的 issues 和 missingTestCases，供 Reviewer 逐一檢查是否已解決

### 結果呈現

在最終結果中顯示：

1. 修改前後的測試數量變化（例：8 → 12）
2. 套用了哪些 Reviewer 建議
3. 重新評分結果（例：B+ → A）

### Phase 5：後置清理

四階段流程全部完成、結果呈現給使用者之後（包含修改流程完成後），委託 Executor subagent 以 `task: "cleanup"` 清理 `{testProjectDir}/.orchestrator/` 目錄。

---

## 錯誤處理

### Analyzer 失敗

如果 Analyzer 找不到 AppHost 專案或分析失敗：

1. 向使用者確認 AppHost 專案路徑是否正確
2. 自己嘗試用 `Grep` 工具搜尋 `<IsAspireHost>true</IsAspireHost>` 定位 AppHost 專案
3. 重新啟動 Analyzer

### Docker 環境不可用

如果 Executor 回報 Docker 未啟動：

1. 在結果中明確告知使用者需要啟動 Docker Desktop
2. Aspire 測試**必須**有 Docker（容器由 AppHost 管理），無法跳過
3. 中止執行並提供修正指引

### Aspire Workload 未安裝

如果 Executor 回報 Aspire workload 未安裝：

1. 告知使用者執行 `dotnet workload install aspire`
2. 中止執行並等待使用者安裝後重試

### Executor 修正後仍有失敗

如果 Executor 經過 5 輪修正後仍有測試失敗：

1. 將失敗訊息和 Executor 的分析一併傳給 Reviewer
2. 在最終結果中明確標示哪些測試失敗
3. 區分「環境問題」（Docker、容器啟動）和「程式邏輯問題」

---

## 多目標支援

當使用者一次指定多個 API 服務或多種測試場景時，執行以下策略：

### 多目標偵測

解析使用者輸入，識別多個測試目標。常見模式：

- 「為 webapi 和 workerservice 兩個 Aspire Resources 建立整合測試」
- 「測試 AppHost 中所有 API 端點」

### 多目標執行策略

| 階段 | 執行方式 | 說明 |
|------|----------|------|
| Phase 1 Analyzer | **平行** | 每個目標獨立分析 |
| Phase 2 Writer | **平行** | 每個目標獨立撰寫測試 |
| Phase 3 Executor | **循序** | Aspire AppHost 啟動不可並行 |
| Phase 4 Reviewer | **平行** | 每份測試獨立審查 |

---

## 重要原則

1. **交接檔案路徑優先** — 傳遞 `analysisFilePath`、`writerResultFilePath`、`executorResultFilePath` 給 subagent，而非嵌入完整 JSON 或 sourceCodeContext。Subagent 會在 Step 0 自行讀取交接檔案取得完整資訊
2. **保持主 context 精簡** — 只保留 subagent 回傳的摘要，不展開中間過程
3. **Aspire ≠ Integration** — 絕不使用 `WebApplicationFactory`，絕不使用 Testcontainers 程式化容器
4. **Resource 名稱一致性** — `CreateHttpClient("name")` 的名稱必須與 AppHost 中 `AddProject("name")` 一致
5. **`requiredSkills` 固定** — Aspire Orchestrator 固定使用 `["aspire-testing"]` 單一 Skill
6. **`suggestedTestScenarios` 必須是中文** — Analyzer 產出的建議測試命名必須使用中文三段式格式
7. **環境檢查不可跳過** — Docker + Aspire workload 兩項環境檢查都必須在 Executor 階段完成
8. **AppHost 啟動超時保護** — Aspire 測試需啟動多個容器，Executor 必須使用長超時設定（10 分鐘+）
