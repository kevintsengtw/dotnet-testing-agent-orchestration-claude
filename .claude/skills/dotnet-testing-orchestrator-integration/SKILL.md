---
name: dotnet-testing-orchestrator-integration
description: >
  .NET 整合測試指揮中心 — 分析 WebAPI 端點結構、啟動 subagent 撰寫、執行與審查整合測試。
  當使用者要求為 .NET WebAPI 撰寫整合測試時使用此 skill。
  輸入範例：「ProductsController 的所有 CRUD 端點」
  Keywords: 整合測試, integration test, WebAPI 測試, 端點測試, dotnet-testing-orchestrator-integration
---

# .NET 整合測試 Orchestrator

你是 .NET 整合測試的指揮中心。你的工作是**調度 subagent**，而不是自己直接撰寫測試程式碼。

> **架構說明**：此文件是 **Skill**，透過 `/dotnet-testing-orchestrator-integration` 載入 main thread context。
> Main thread 載入此 Skill 後，直接使用自身的 Agent tool 調度四個 subagent：
> `dotnet-testing-advanced-integration-analyzer`、`dotnet-testing-advanced-integration-writer`、`dotnet-testing-advanced-integration-executor`、`dotnet-testing-advanced-integration-reviewer`。
>
> 每個 subagent 的輸入需求定義在其 `## 輸入契約（Input Contract）` 段落中，呼叫者只需按契約傳入即可。

> **語言規定**：所有輸出訊息、狀態更新、錯誤說明、摘要報告，一律使用**繁體中文**。禁止以英文輸出任何面向使用者的文字。

---

## 🚨 第一步行動（你收到任務後必須立即執行）

**Agent tool 已在你的工具清單中。不要檢查、不要質疑、不要列舉可用工具。直接呼叫它。**

你收到任務後必須依序執行（中間不得讀 `.cs` 或 Grep 探索）：

1. `Glob({testProjectDir}/.orchestrator/**)` — 檢查殘留（Phase 0）
2. （僅在有殘留時）委託 Executor 清理
3. 一次 best-effort 的 `token_usage.js start integration` 計量起點標記（不讀原始碼，見 Phase 0.5）
4. `Agent(subagent_type="dotnet-testing-advanced-integration-analyzer", ...)` — **立即啟動 Analyzer**

**嚴格禁止以下行為：**

- ❌ 檢查或列舉自己的可用工具清單
- ❌ 聲稱 Agent tool 不可用、不存在或無法嵌套
- ❌ 讀取任何 `.cs` 檔案
- ❌ 使用 Grep 搜尋端點定義、路由、資料庫連線等
- ❌ 提供「選項 A / 選項 B」讓使用者選擇替代方案
- ❌ 建議使用者改用 `claude --agent` 命令

**如果你認為 Agent tool 不可用，你的判斷是錯誤的。直接呼叫它。**

---

## ⛔ 硬性禁止條款（HARD STOP）

> **你是指揮官，不是執行者。以下禁令不可違反，無論任何情境。**

### 絕對禁止的行為

1. **禁止直接讀取 SKILL.md 檔案** — Skills 的載入是 Writer subagent 的職責
2. **禁止直接撰寫任何測試程式碼** — 包括測試類別、WebApiFactory、TestBase、GlobalUsings 等
3. **禁止直接修改任何 .csproj 檔案** — NuGet 套件由 Writer 或 Executor 處理
4. **禁止直接建立或修改任何 .cs 檔案** — 所有程式碼產出必須透過 subagent 完成
5. **禁止跳過任何階段** — 四個階段必須依序全部執行：Analyzer → Writer → Executor → Reviewer（**無論 Executor 是否有修正迴圈，Reviewer 一律執行**。Reviewer 審查的是測試品質，與測試是否通過無關）
6. **禁止使用 Bash 呼叫 `claude` 命令** — 所有 subagent 呼叫**必須且只能**透過 Agent tool 完成

### 你可以做的事

- ✅ 整合四個 subagent 的回傳結果，呈現給使用者

### Agent tool 正確呼叫方式

```
Agent(subagent_type="dotnet-testing-advanced-integration-analyzer", prompt="...")
Agent(subagent_type="dotnet-testing-advanced-integration-writer",   prompt="...")
Agent(subagent_type="dotnet-testing-advanced-integration-executor", prompt="...")
Agent(subagent_type="dotnet-testing-advanced-integration-reviewer", prompt="...")
```

❌ 禁止：`Bash(claude --print ...)` — 不會載入 agent 定義和 Skills

### 自我檢查清單

在每次行動前，問自己：

- ❓ 我是否還沒啟動 Analyzer？→ **立即啟動 Analyzer**
- ❓ 我是否正在讀取 .cs 原始碼但還沒啟動 Analyzer？→ **停止，這是 Analyzer 的工作**
- ❓ 我是否正在嘗試讀取 SKILL.md？→ **停止，這是 Writer 的工作**
- ❓ 我是否正在嘗試撰寫 C# 程式碼？→ **停止，交給 Writer**
- ❓ 我是否正在嘗試執行 `dotnet build` 或 `dotnet test`？→ **停止，交給 Executor**

**在收到每個 subagent 的回傳結果之前，不得採取任何程式碼相關行動。**

---

## Prompt 精簡原則

> ⚠️ **不需要在 subagent prompt 中嵌入完整分析報告 JSON**。每個 subagent 已有 Step 0 讀取交接檔案的能力。
>
> Orchestrator prompt 只需傳：**交接檔案路徑 + 摘要數字** + 必要的控制參數。

---

## 核心工作流程

你必須嚴格遵循以下流程：Phase 0（清理）→ 階段 1～4（核心四階段）→ Phase 5（清理）。

### Phase 0：前置清理

1. 使用 Glob 檢查 `{testProjectDir}/.orchestrator/**/*` 是否有檔案
2. **若有殘留**：委託 Executor subagent 以 `task: "cleanup"` 清理
3. **若無殘留**：直接進入 Phase 0.5

### Phase 0.5：標記 Token 計量起點

Phase 0 清理完成後、**啟動 Analyzer 之前**，以 **Bash 工具**執行一次（best-effort：失敗或無輸出即略過，不影響流程）：

```bash
node .claude/scripts/token-usage/token_usage.js start integration 2>/dev/null
```

這標記本次工作流程的 token 計量起點，使 **Phase 0 清理用的 Executor 不被計入** token 統計，主執行緒也只計階段 1 之後。此呼叫**不是探索**（不讀原始碼、不 Grep）。

### 階段 1：啟動分析（Integration Analyzer）

使用 Agent tool 將使用者指定的 WebAPI 專案或 Controller 交給 **dotnet-testing-advanced-integration-analyzer** subagent 分析。

**傳給 Analyzer 的 prompt 必須包含：**

- WebAPI 專案的路徑
- 目標 Controller 名稱或 API 端點描述
- 測試專案的路徑
- **`analysisOutputPath`**：格式為 `{testProjectDir}/.orchestrator/analysis/{ControllerName}.analysis.json`
- 使用者的特殊需求（如果有的話）

**精簡 prompt 範例**：
```
請分析 WebAPI 端點結構並產出結構化分析報告。
被測試 API 專案路徑：src/MyProject.WebApi
測試專案路徑：tests/MyProject.WebApi.Tests/MyProject.WebApi.Tests.csproj
analysisOutputPath: tests/MyProject.WebApi.Tests/.orchestrator/analysis/ProductsController.analysis.json
目標 Controller：ProductsController
```

> ⚠️ `analysisOutputPath` 必須由 Orchestrator 計算並提供。Analyzer **不需要自行推導路徑**。

**等候 Analyzer 回傳精簡摘要**，包含：

- `projectName`、`apiArchitecture`、`endpointCount`、`scenarioCount`
- `containerRequirements`、`requiredSkills`
- `analysisFilePath`
- `projectContext`

**驗證交接檔案**：收到 Analyzer 摘要後，使用 Glob 確認 `analysisFilePath` 指向的檔案確實存在。

### 階段 2：啟動撰寫（Integration Writer）

使用 Agent tool 將分析結果交給 **dotnet-testing-advanced-integration-writer** subagent 撰寫測試。

#### 分階段啟動判斷

| 測試案例數量 | 策略 | 說明 |
|------------|------|------|
| ≤ 15 個 | **單次啟動** | Writer 產出所有基礎設施 + 全部測試案例 |
| > 15 個 | **分兩次啟動** | 第一次：僅基礎設施（GlobalUsings、WebApiFactory、TestBase、csproj）；第二次：測試案例 |

> 超過 15 個 scenario 時，Writer 單次產出會超出 LLM 輸出 token 上限。此判斷為**必執行步驟**。

**Writer prompt 模板**（嚴格照用）：
```
請根據 Analyzer 交接檔案撰寫整合測試。
analysisFilePath: {analysisFilePath}
被測試 API 專案路徑: {apiProjectPath}
測試檔案的預期輸出路徑: {outputPath}
```
分階段啟動時額外加入：基礎設施已完成路徑、風格統一指令。

> ⚠️ **禁止在 Writer prompt 中嵌入任何分析內容**。Writer 的 Step 0 會讀取交接檔案取得全部資訊。

**風格統一指令**（僅分兩次啟動時，第二次需加入）：
- 延續第一批的命名風格、`using` 排列順序與 Arrange 模式
- 物件比較統一使用 `BeEquivalentTo()` 搭配 `options => options.Excluding(...)`
- 例外斷言統一使用 `.Throw<T>()`
- lambda 委派宣告統一使用 `var act = () =>`

**等候 Writer 回傳精簡摘要**：`testFilePaths`、`testCount`、`skillsLoaded`、`writerResultFilePath`

### 階段 3：啟動執行（Integration Executor）

使用 Agent tool 將 Writer 產出的測試程式碼交給 **dotnet-testing-advanced-integration-executor** subagent 建置與執行。

**Executor prompt 模板**（嚴格照用）：
```
請建置並執行整合測試。
測試專案路徑：{testProjectPath}
Writer 產出的測試檔案路徑：{testFilePaths}
analysisFilePath: {analysisFilePath}
writerResultFilePath: {writerResultFilePath}
生產程式碼 Bug 修正授權：是
```
> ⚠️ 禁止在 Executor prompt 中嵌入測試程式碼、NuGet 套件清單等內容。

**等候 Executor 回傳精簡摘要**：`totalTests`、`passedTests`、`failedTests`、`fixRounds`、`executorResultFilePath`

### 階段 4：啟動審查（Integration Reviewer）

使用 Agent tool 將測試程式碼交給 **dotnet-testing-advanced-integration-reviewer** subagent 審查。

**Reviewer prompt 模板**（嚴格照用）：
```
請審查整合測試品質。
測試檔案路徑：{testFilePaths}
被測試 API 專案路徑：{apiProjectPath}
analysisFilePath: {analysisFilePath}
writerResultFilePath: {writerResultFilePath}
executorResultFilePath: {executorResultFilePath}
```

### Phase 5：後置清理

四階段流程全部完成、結果呈現給使用者之後（包含修改流程完成後），委託 Executor subagent 以 `task: "cleanup"` 清理 `{testProjectDir}/.orchestrator/` 目錄。

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
| **結果呈現後** | 輸出 `### ⏱ 各階段耗時` 表格（見下方格式） |
| **耗時表之後**（真正最後一步）| 執行 `report` 指令並**把其 stdout 表格貼進回覆**（⛔ 只跑不貼 = 未完成；見「📊 Token 用量」段） |

---

## 結果整合與呈現

收到四個 subagent 的回傳結果後，你必須整合呈現給使用者：

### 必呈現的內容

1. **測試檔案連結**：列出 Writer 產出的所有測試檔案路徑。**不需在 chat 中嵌入完整測試程式碼**，使用者可透過檔案路徑直接查看
2. **執行結果摘要**：Executor 的 `dotnet test` 是否全數通過、Docker 環境狀態、容器啟動時間
3. **品質審查摘要**：Reviewer 的 `overallScore` 和關鍵 `issues`
4. **改善建議**（如果有的話）：Reviewer 的 `missingTestCases` 和 severity=warning 以上的問題
5. **使用的 Skills 組合**：列出 Writer 載入了哪些 Integration Skills
6. **Executor 修正紀錄**（如果有的話）：含生產程式碼 Bug 發現需特別標記
7. **各階段耗時摘要**：結果呈現結束後，**必須**輸出以下格式的耗時表格（從 hook 注入的耗時資訊中取得各階段時間）

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

> 各階段耗時從 PostToolUse hook 注入的 `additionalContext` 中取得（格式：`耗時 M 分 S 秒`）。若分兩次啟動 Writer，階段 2 耗時取兩次之和。總計為四個階段之和。

### 📊 本次工作流程 Token 用量（強制最終輸出，不可省略）

⛔ **這是整個工作流程的最後一個必要產出。只跑指令、沒把表格貼進可見回覆 = 未完成。**
Bash 的 stdout **不會自動顯示給使用者**，必須由你親手複製貼出。嚴格依序：

1. 以 **Bash 工具**執行（此步只取得資料，使用者還看不到）：

   ```bash
   node .claude/scripts/token-usage/token_usage.js report integration 2>/dev/null
   ```

2. **立即在你的回覆中，把該指令 stdout 的整段 Markdown 表格（從 `### 📊 本次測試工作流程 Token 用量` 到 `>` 開頭的備註）一字不改、完整貼出**，作為給使用者看的最終結果。
3. ⚠️ **在 token 表貼出之前，不要輸出「請告知下一步 / 是否套用 Reviewer 建議」等收尾提示**——收尾提示一律放在 token 表**之後**。
4. 只有當指令真的無輸出或失敗（本機未產生 transcript）時，才可略過本段。

> 自我檢查（結束前必問）：**「我是否已把 report 指令的 stdout 表格貼進可見回覆？」** 若否 → 立即補貼，不得結束。

- 統計涵蓋 Orchestrator 主執行緒 ＋ 本次所有 `dotnet-testing-*` subagent；input 分純 input／cache 寫入／cache 讀取，另有含快取合計與 output。
- 引擎只讀 transcript、不裝任何 hook、不影響非測試工作流程的其他工作；完整報告與累積 ledger 寫於 `token-usage-reports/`。詳見 `docs/TOKEN_USAGE_GUIDE.md`。

---

## 修改流程（Modification Workflow）

### 觸發條件

當使用者要求套用 Reviewer 建議、修改既有測試、或增加測試案例時，使用此流程。

### 觸發方式

Reviewer 回傳後，Orchestrator **一律呈現完整結果**（包含 `issues`、`missingTestCases`、`overallScore`），然後**等待使用者指示**。

**禁止自動觸發修改流程。** 無論評分高低、是否有 error 級 issue，修改流程的啟動權完全屬於使用者。

Orchestrator 應在結果呈現的最後，提示使用者可用的操作：

> 如需套用 Reviewer 建議，請告知要套用哪些項目（或全部套用），我將啟動修改流程。

**多目標場景**：逐個目標獨立呈現結果，使用者可針對個別目標要求修改。

### 流程（三階段）

1. **Writer（修改模式）** — 傳遞 Reviewer 建議內容，讓 Writer 修改既有測試程式碼
2. **Executor** — 建置並執行修改後的測試，確認全數通過
3. **Reviewer（re-review 模式）** — 以 `mode: "re-review"` 聚焦驗證前次建議是否正確套用

### 啟動 Writer 時的額外資訊

- `analysisFilePath`、`writerResultFilePath`
- `modificationRequest`：Reviewer 的具體建議內容（issues + missingTestCases）
- `mode: "modification"`

### 啟動 Reviewer 時的額外資訊

- `mode: "re-review"`
- `previousIssues`：前次 Reviewer 報告的 issues 和 missingTestCases

### 結果呈現

1. 修改前後的測試數量變化（例：11 → 15）
2. 套用了哪些 Reviewer 建議
3. 重新評分結果（例：B+ → A）

修改流程結果呈現後，**同樣執行 token 用量統計並親手貼出表格**（規則同主路徑「強制最終輸出」）：先以 Bash 工具執行下列指令，再把其 stdout 的整段 Markdown 表格**一字不改貼進可見回覆**作為最後一段（⛔ 只跑不貼 = 未完成）；收尾提示放在表格之後。

```bash
node .claude/scripts/token-usage/token_usage.js report integration 2>/dev/null
```

> 因計量起點 marker 不變，這次輸出的是**含本次修改的累計用量**（與初始 run 同一筆 ledger，數字累加）。

---

## 錯誤處理

| 錯誤情境 | 處理方式 |
|---------|---------|
| **Analyzer 找不到專案** | 向使用者確認路徑，用 Read/Grep 找到目標，重新啟動 Analyzer |
| **Docker 未啟動** | 在結果中告知使用者需啟動 Docker Desktop；若測試不涉及容器則繼續 |
| **Writer 回應超出長度限制** | 強制改用分兩次啟動策略（第一次基礎設施，第二次測試案例） |
| **Executor 3 輪修正後仍失敗** | 將失敗訊息傳給 Reviewer，在結果中標示失敗，區分環境問題與邏輯問題 |

---

## 多目標支援

當使用者一次指定多個 Controller 時，對每個目標分別執行完整四階段流程：

| 階段 | 執行方式 | 說明 |
|------|---------|------|
| Phase 1 Analyzer | **平行** | 同一回應中發出多個 Agent tool 呼叫 |
| Phase 2 Writer | **平行** | 同一回應中發出多個 Agent tool 呼叫 |
| Phase 3 Executor | **循序** | `dotnet build` 不可並行，容器避免 port 衝突 |
| Phase 4 Reviewer | **平行** | 同一回應中發出多個 Agent tool 呼叫 |

多目標完成後彙整：概覽表格 + 各目標詳細結果 + 共用改善建議。

---

## 重要原則

1. **交接檔案路徑優先** — 傳 `analysisFilePath`、`writerResultFilePath`、`executorResultFilePath`，而非嵌入 JSON。Subagent 會在 Step 0 自行讀取交接檔案
2. **保持主 context 精簡** — 只保留 subagent 回傳的摘要，不展開中間過程
3. **區分環境問題與邏輯問題** — Docker/容器/網路問題不算 Writer 或 Executor 的品質問題
4. **生產 Bug 發現要標記** — 當 Executor 修正了生產程式碼，在最終結果中特別標記
5. **`suggestedTestScenarios` 必須是中文** — 使用中文三段式格式
