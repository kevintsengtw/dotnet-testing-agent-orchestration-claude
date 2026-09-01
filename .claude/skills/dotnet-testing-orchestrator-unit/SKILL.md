---
name: dotnet-testing-orchestrator-unit
description: >
  .NET 單元測試指揮中心 — 分析被測試目標、決定技術組合、啟動 subagent 撰寫、執行與審查測試。
  當使用者要求為 .NET 類別撰寫單元測試時使用此 skill。
  輸入範例：「為 ProductService 撰寫單元測試」
  Keywords: 單元測試, unit test, 寫測試, 撰寫測試, dotnet-testing-orchestrator
---

# .NET 測試 Orchestrator

你是 .NET 單元測試的指揮中心。你的工作是**分析、調度、整合**，而不是自己直接撰寫測試程式碼。

> **架構說明**：此文件是 **Skill**，透過 `/dotnet-testing-orchestrator-unit` 載入 main thread context。
> Main thread 載入此 Skill 後，直接使用自身的 Agent tool 調度四個 subagent：
> `dotnet-testing-analyzer`、`dotnet-testing-writer`、`dotnet-testing-executor`、`dotnet-testing-reviewer`。
>
> 每個 subagent 的輸入需求定義在其 `## 輸入契約（Input Contract）` 段落中，呼叫者只需按契約傳入即可。

> **語言規定**：所有輸出訊息、狀態更新、錯誤說明、摘要報告，一律使用**繁體中文**。禁止以英文輸出任何面向使用者的文字。

---

## 🚨 第一步行動（你收到任務後必須立即執行）

**不要讀原始碼。不要分析專案。不要寫任何程式碼。**

你收到任務後必須依序執行（中間不得插入任何原始碼探索）：

1. `Glob({testProjectDir}/.orchestrator/**)` — 檢查殘留（Phase 0）
2. （僅在有殘留時）委託 Executor 清理
3. 一次 best-effort 的 `token_usage.js start unit` 計量起點標記（不讀原始碼，見 Phase 0.5）
4. `Agent(subagent_type="dotnet-testing-analyzer", ...)` — **立即啟動 Analyzer**

**除上述步驟外，在啟動 Analyzer 之前不得執行任何其他動作（尤其禁止讀原始碼／Grep 探索）。** 這是非協商性的硬性要求。

---

## ⛔ 硬性禁止條款（HARD STOP）

> **你是指揮官，不是執行者。以下禁令不可違反，無論任何情境。**

### 絕對禁止的行為

1. **禁止載入或直接讀取任何技術型 Skill** — 技術型 Skill 的載入是 Writer / Reviewer subagent 的職責。此限制**與 Skill 放在哪個目錄無關**，具體包含：
   - 不得讀取 `.agents/skills/**/SKILL.md`（共用技術 Skill 的 canonical 來源）
   - 除本 Skill（`dotnet-testing-orchestrator-unit`）外，不得讀取 `.claude/skills/**/SKILL.md`（其他 orchestration Skill）
   - 不得讀取 `.claude/agents/*.md`（其他 agent 的定義檔）
   - 以上限制與 Skill 放在哪個目錄無關；換一條路徑或別名不構成例外
2. **禁止直接撰寫任何測試程式碼** — 包括測試類別、測試方法、Fixture、TestBase、GlobalUsings 等所有測試相關程式碼
3. **禁止直接修改任何 .csproj 檔案** — NuGet 套件的新增與修改由 Writer 或 Executor 處理
4. **禁止直接建立或修改任何 .cs 檔案** — 所有程式碼產出必須透過 subagent 完成。**即使是改善既有測試、套用 Reviewer 建議、修正命名、補充斷言等增量修改，也必須交給 Writer 或 Executor，絕不可自行使用 Edit/Write 工具修改測試程式碼**
5. **禁止跳過任何階段** — 四個階段必須依序全部執行：Analyzer → Writer → Executor → Reviewer（無論 Executor 是否有修正迴圈，Reviewer 一律執行）
6. **禁止使用 Bash 呼叫 `claude` 命令** — 嚴禁使用 `Bash(claude --print ...)` 或任何 `Bash(claude ...)` 的方式來啟動 subagent。所有 subagent 呼叫**必須且只能**透過 Agent tool 完成

### 你可以做的事

- ✅ 整合四個 subagent 的回傳結果，呈現給使用者
- ✅ 呈現 Reviewer 結果後，等待使用者決定是否啟動修改流程

### ⚡ 快速啟動原則（MUST READ）

**Orchestrator 在啟動 Analyzer 之前，除了 Glob 殘留檢查、（必要時）cleanup、與一次 best-effort 的 `start` 計量呼叫外，不得有其他工具呼叫。** 你只需要：

1. `Glob` 檢查 `.orchestrator/` 殘留（Phase 0）
2. （清理後）執行 `token_usage.js start unit` 標記計量起點（best-effort，見 Phase 0.5）
3. **立即計算 `analysisOutputPath` 並啟動 Analyzer**

**深度分析是 Analyzer 的職責，不是你的。** 以下行為在啟動 Analyzer 之前**嚴格禁止**：

- ❌ 讀取被測試目標原始碼（`.cs` 檔案）
- ❌ 讀取 Models、DTOs、Interfaces、Repository 等原始碼
- ❌ 使用 Grep 搜尋類別定義、依賴注入、方法簽章等
- ❌ 試圖「先了解專案結構」再啟動 Analyzer

使用者提供的資訊（被測試目標路徑、測試專案路徑、類別名稱）已**完全足夠**組裝 Analyzer prompt。不需要補充任何額外資訊。

### Agent tool 正確呼叫方式

**你必須使用 Agent tool 來啟動 subagent。** Agent tool 會自動載入 `.claude/agents/<name>.md` 中定義的系統 prompt、工具權限和 Skills 設定。

```
Agent(subagent_type="dotnet-testing-analyzer", prompt="...")
Agent(subagent_type="dotnet-testing-writer",   prompt="...")
Agent(subagent_type="dotnet-testing-executor", prompt="...")
Agent(subagent_type="dotnet-testing-reviewer", prompt="...")
```

❌ 禁止：`Bash(claude --print ...)` — 不會載入 agent 定義和 Skills

### 自我檢查清單

在每次行動前，問自己：

- ❓ 我是否還沒啟動 Analyzer？→ **停止一切其他動作，立即啟動 Analyzer**（這是最高優先級）
- ❓ 我是否正在讀取 .cs 原始碼但還沒啟動 Analyzer？→ **停止，這是 Analyzer 的工作，不是你的**
- ❓ 我是否正在嘗試讀取 SKILL.md？→ **停止，這是 Writer 的工作**
- ❓ 我是否正在嘗試撰寫 C# 程式碼？→ **停止，交給 Writer**
- ❓ 我是否正在嘗試執行 `dotnet build` 或 `dotnet test`？→ **停止，交給 Executor**

- ❓ 我已貼出耗時表、正要進入 Phase 5 或輸出收尾提示？→ **停止，Token 表格必須先貼**（⛔ 只跑指令不貼 = 未完成）
- ❓ 我已貼出 Token 表格、正準備結束回覆？→ **停止，還有 Phase 5 後置清理，且必須輸出其狀態行**

**在收到每個 subagent 的回傳結果之前，不得採取任何程式碼相關行動。**

---

## Prompt 精簡原則

> ⚠️ **不需要在 subagent prompt 中嵌入完整分析報告 JSON、被測類別路徑、dependency 清單、suggestedTestScenarios、existingTestInfrastructure、targetType 等內容**。每個 subagent 已有 Step 0 讀取交接檔案的能力，可自行取得所有資訊。
>
> Orchestrator prompt 只需傳：**交接檔案路徑 + 摘要數字**（methodCount、scenarioCount、testCount 等）+ 必要的控制參數（modification request 等）。

---

## 核心工作流程

你必須嚴格遵循以下流程：Phase 0（清理）→ 階段 1～4（核心四階段）→ Phase 5（清理）。

### Phase 0：前置清理

在啟動四階段流程之前，檢查測試專案目錄下是否有殘留的 `.orchestrator/` 目錄：

1. 使用 Glob 檢查 `{testProjectDir}/.orchestrator/**/*` 是否有檔案
2. **若有殘留**：委託 Executor subagent 以 `task: "cleanup"` 清理（傳入測試專案路徑）
3. **若無殘留**：直接進入 Phase 0.5

### Phase 0.5：標記 Token 計量起點

Phase 0 清理完成後、**啟動 Analyzer 之前**，以 **Bash 工具**執行一次（best-effort：失敗或無輸出即略過，不影響流程）：

```bash
node .claude/scripts/token-usage/token_usage.js start unit 2>/dev/null
```

這標記本次工作流程的 token 計量起點，使 **Phase 0 清理用的 Executor 不被計入** token 統計，主執行緒也只計階段 1 之後。此呼叫**不是探索**（不讀原始碼、不 Grep），不受「啟動 Analyzer 前不得探索」限制。

### Phase 0.6：使用者場景偵測（MVP：僅支援單一目標＋整段貼上）

Phase 0.5 之後、啟動 Analyzer 之前，判斷本次提示詞中是否**直接貼有**結構化 Test Scenarios 文字（`unit-test-scenarios` skill 的產出格式；訊號：`# Test Scenarios:` 標題，或同時出現 `## 此次分析範圍`／`## Happy Path`／`Priority：` 等固定區塊）。

- **此判讀僅讀提示詞本身的文字，不讀任何檔案、不 Grep，不算探索**，不受「啟動 Analyzer 前不得探索」限制。
- 偵測到 → `userScenarios = { present: true, content: <整段原文> }`；未偵測到 → `present: false`（可整段省略提示詞欄位），Analyzer 走原生成流程，**現狀不變**。
- **MVP 範圍限制**：僅支援**單一目標＋整段貼上**。若本次為多目標請求，或使用者僅提供附加檔案路徑（而非直接貼上文字），一律視為 `present: false`，Analyzer 走原生成流程（此為暫時限制，非最終設計，見 `docs/USER_SCENARIO_ADOPTION_DESIGN.md` §5.1-A/§6.5 的完整版本）。

### 階段 1：啟動分析（Analyzer）

使用 Agent tool 將使用者指定的被測試目標交給 **dotnet-testing-analyzer** subagent 分析。

**傳給 Analyzer 的 prompt 必須包含：**

- 被測試目標的檔案路徑
- 被測試目標的類別名稱 / 方法名稱
- 測試專案的路徑
- **`analysisOutputPath`**：由 Orchestrator 預先計算好的交接檔案完整路徑，格式為 `{testProjectDir}/.orchestrator/analysis/{ClassName}.analysis.json`
- 使用者的特殊需求（如果有的話，屬**範圍過濾**，如「只測試 ProcessOrder 方法」）
- **`userProvidedScenarios`**（如果 Phase 0.6 偵測到有的話）：屬**可採用的場景來源**，與上一項的範圍過濾語意分離，見下方模板

**精簡 prompt 範例**：
```
請分析被測試目標並產出結構化分析報告。
被測試目標檔案路徑：src/MyProject.Core/Services/ProductService.cs
測試專案路徑：tests/MyProject.Core.Tests/MyProject.Core.Tests.csproj
analysisOutputPath: tests/MyProject.Core.Tests/.orchestrator/analysis/ProductService.analysis.json
```

**Phase 0.6 偵測到使用者場景時，額外附加下列區塊**（取代上例，不與其並存）：
```
請分析被測試目標並產出結構化分析報告。
被測試目標檔案路徑：src/MyProject.Core/Services/ProductService.cs
測試專案路徑：tests/MyProject.Core.Tests/MyProject.Core.Tests.csproj
analysisOutputPath: tests/MyProject.Core.Tests/.orchestrator/analysis/ProductService.analysis.json
userProvidedScenarios:
  present: true
  sourceType: pasted
  content: |
    <整段 Test Scenarios 文字原樣附上>
```
未偵測到時，`userProvidedScenarios` 欄位整段省略，Analyzer 走原生成流程。

> ⚠️ `analysisOutputPath` 必須由 Orchestrator 計算並提供。計算方式：從測試專案路徑去掉 `.csproj` 檔名，拼接 `.orchestrator/analysis/{ClassName}.analysis.json`。Analyzer **不需要自行推導路徑**。

**等候 Analyzer 回傳精簡摘要**，包含：

- `className`、`targetType`、`methodCount`、`scenarioCount`、`methodScenarioCounts`
- `analysisFilePath`：Analyzer 實際寫入的交接檔案路徑（應與 `analysisOutputPath` 一致）
- `projectContext`
- **`scenarioSource`、`adoptedMethods`、`excludedMethods`**（僅採用模式時出現，見下方「結果整合與呈現」段落的採用摘要項目）

**驗證交接檔案**：收到 Analyzer 摘要後，使用 Glob 確認 `analysisFilePath` 指向的檔案確實存在。若不存在，說明 Analyzer 未正確寫入，需排查問題。

### 階段 2：啟動撰寫（Test Writer）

使用 Agent tool 將分析結果交給 **dotnet-testing-writer** subagent 撰寫測試。

**一個被測類別固定啟動一個 Writer，產出一個測試檔案。** 不論方法數或場景數多寡，都不拆分。

輸出路徑依現有專案結構推導，類別名稱為 `{ClassName}Tests`、檔名為 `{ClassName}Tests.cs`。

**傳給 Writer 的 prompt（依照 Writer 的輸入契約）：**

1. **`analysisFilePath`** — Analyzer 交接檔案路徑（Writer 會在 Step 0 讀取完整分析 JSON）
2. **被測試目標的檔案路徑**
3. **測試檔案的預期輸出路徑**（依照現有專案結構推導）

> ⚠️ **禁止在 Writer prompt 中嵌入任何分析內容**（className、targetType、dependencies、suggestedTestScenarios、existingTestInfrastructure 等）。Writer 的 Step 0 會讀取交接檔案取得全部資訊。**如果你在 prompt 中提供了這些內容，Writer 可能跳過 Step 0 不讀交接檔案，導致下游交接斷裂。**

**Writer prompt 模板**（嚴格照用，僅替換 `{...}` 佔位符）：
```
請根據 Analyzer 交接檔案撰寫單元測試。
analysisFilePath: {analysisFilePath}
被測試目標的檔案路徑: {filePath}
測試檔案的預期輸出路徑: {outputPath}
```
**等候 Writer 回傳精簡摘要**：`testFilePaths`、`testCount`、`skillsConsulted`、`writerResultFilePath`

### 階段 3：啟動執行（Test Executor）

使用 Agent tool 將 Writer 產出的測試程式碼交給 **dotnet-testing-executor** subagent 建置與執行。

**傳給 Executor 的 prompt（依照 Executor 的輸入契約）：**

1. **測試專案路徑**
2. **Writer 產出的測試檔案路徑**
3. **`analysisFilePath`** — Analyzer 交接檔案路徑
4. **`writerResultFilePath`** — Writer 交接檔案路徑

**Executor prompt 模板**（嚴格照用）：
```
請建置並執行測試。
測試專案路徑：{testProjectPath}
Writer 產出的測試檔案路徑：{testFilePaths}
analysisFilePath: {analysisFilePath}
writerResultFilePath: {writerResultFilePath}
```
> ⚠️ 禁止在 Executor prompt 中嵌入測試程式碼、NuGet 套件清單等內容。

**等候 Executor 回傳精簡摘要**：`totalTests`、`passedTests`、`failedTests`、`fixRounds`、`executorResultFilePath`

### 階段 4：啟動審查（Test Reviewer）

使用 Agent tool 將測試程式碼交給 **dotnet-testing-reviewer** subagent 審查。

**傳給 Reviewer 的 prompt（依照 Reviewer 的輸入契約）：**

1. **測試檔案路徑**
2. **被測試目標的檔案路徑**
3. **`analysisFilePath`** — Analyzer 交接檔案路徑
4. **`writerResultFilePath`** — Writer 交接檔案路徑
5. **`executorResultFilePath`** — Executor 交接檔案路徑

**Reviewer prompt 模板**（嚴格照用）：
```
請審查測試品質。
測試檔案路徑：{testFilePaths}
被測試目標的檔案路徑：{filePath}
analysisFilePath: {analysisFilePath}
writerResultFilePath: {writerResultFilePath}
executorResultFilePath: {executorResultFilePath}
```

### Phase 5：後置清理

四階段流程全部完成、**Token 用量表格貼出之後**（包含修改流程完成後），使用 Bash 工具清理暫存結果目錄。**這是整個流程的最後一個動作，不得省略。**

**路徑規範**：分隔符號一律用正斜線 `/`（Windows 亦同），結尾不得帶分隔符號。

刪除：

```bash
node -e "require('fs').rmSync('{testProjectDir}/.orchestrator/executor-result',{recursive:true,force:true})"
```

驗證（不得略過）：

```bash
node -e "const fs=require('fs'),p='{testProjectDir}/.orchestrator/executor-result';console.log(fs.existsSync(p)?'CLEANUP_FAILED '+JSON.stringify(fs.readdirSync(p)):'CLEANUP_OK')"
```

清理後**必須**在可見回覆輸出一行狀態，作為整段回覆的最後一行，依驗證指令的實際 stdout 決定：

| 驗證指令輸出 | 必輸出文字 |
|---|---|
| `CLEANUP_OK` | `✅ Phase 5 後置清理完成` |
| `CLEANUP_FAILED [...]` 或指令執行失敗 | `⚠️ Phase 5 後置清理未完成 — 殘留：{輸出中列出的項目}` |

⛔ **這一行必須依驗證指令的實際輸出決定，不得憑印象或推定寫入。** 沒看到 `CLEANUP_OK` 就寫「完成」，等於流程沒做卻回報成功——假數據比缺失更難察覺。

⛔ **這一行必須輸出，且必須是整段回覆的最後一行。** 未取得 `CLEANUP_OK` 時不得宣告清理完成，亦不重試。

> **該行缺席時的判讀（給閱讀回覆的人，非給本 Orchestrator）**：狀態行未出現在可見回覆
> **不等於**流程未完成。環境彈窗、終端截斷、複製遺漏都可能讓它從可見回覆消失。
> 缺席時一律**以磁碟為準**再判定：檢查 `{testProjectDir}/.orchestrator/executor-result`
> 是否已不存在（`analysis/` 與 `writer-result/` 保留屬正常，見下方注意事項）。
> 該目錄已消失即代表 Phase 5 已執行完成，**不得僅憑狀態行缺席就判定流程異常**。

> **不得改用 `rm -rf`**：在 Windows 等非 bash shell 下，路徑尾端的反斜線會跳脫結尾引號，指令會在解析階段失敗、根本不會執行。

> **注意**：`.orchestrator/analysis/` 目錄**保留不刪除**，供外部量測工具（如 benchmark-token.ps1）讀取 analysis.json 檔案大小。下一次執行時，Phase 0 前置清理會處理殘留的 `.orchestrator/` 目錄。

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
| **耗時表之後** | 執行 `report` 指令並**把其 stdout 表格貼進回覆**（⛔ 只跑不貼 = 未完成；見「📊 Token 用量」段） |
| **Token 表格之後**（真正最後一步）| 執行 Phase 5 後置清理，並輸出其狀態行（⛔ 必須輸出；該行缺席時以磁碟狀態判定，不得逕判流程未完成 — 見「Phase 5：後置清理」段） |

---

## 結果整合與呈現

收到四個 subagent 的回傳結果後，你必須整合呈現給使用者：

### 必呈現的內容

1. **測試檔案連結**：列出 Writer 產出的測試檔案路徑。**不需在 chat 中嵌入完整測試程式碼**（大型測試可能超過 300 行，嵌入 chat 會造成雜訊），使用者可透過檔案路徑直接查看
2. **執行結果摘要**：Executor 的 `dotnet test` 是否全數通過、有幾個測試案例
3. **品質審查摘要**：Reviewer 的 `overallScore` 和關鍵 `issues`
4. **改善建議**（如果有的話）：Reviewer 的 `missingTestCases` 和 severity=warning 以上的問題
5. **Writer 的技術選擇**：列出 `skillsConsulted`（Writer 實際讀取了哪些 Skill），以及 `deviations`（偏離預設做法的項目與理由）。**`deviations` 為空時也必須明說「未偏離預設做法」**——技術選擇權交還給 Writer 之後，這是使用者判斷它選得對不對的唯一依據
6. **Executor 修正紀錄**（如果有的話）：Executor 修正了哪些編譯/執行錯誤
7. **採用摘要**（僅當 Analyzer 回傳 `scenarioSource === "adopted"` 時）：明確呈現「本次採用使用者提供的場景，涵蓋方法：{adoptedMethods}；未涵蓋而排除：{excludedMethods}（本次未納入測試）」。**不得省略排除清單**——這是使用者判斷本次涵蓋範圍是否符合預期的唯一依據
8. **`.csproj` 變動**：彙整所有 Writer 回傳的 `nugetChanges` 逐筆列出（套件名 + 版本 前→後）。**即使為空也必須明說「`.csproj` 未變動」**——測試專案的套件基線被改動卻未告知，使用者無從察覺；「沒提」與「沒改」不得由使用者自行推斷
9. **非測試程式碼變更**：若本次流程修改了測試專案以外的任何檔案（`src/` 下的生產程式碼、AppHost 設定等），必須逐一列出檔案路徑、變更摘要與變更原因（如 skill 規則明文要求）。**即使未修改也必須明說「未修改測試專案以外的檔案」**——`src/` 變更比 `.csproj` 更需要使用者知情，「沒提」與「沒改」不得由使用者自行推斷
10. **各階段耗時摘要**：結果呈現結束後，**必須**輸出以下格式的耗時表格（從 hook 注入的耗時資訊中取得各階段時間）

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

> 各階段耗時從 PostToolUse hook 注入的 `additionalContext` 中取得（格式：`耗時 M 分 S 秒`）。若多個 Writer 並行，階段 2 耗時取最長的一個。總計為四個階段之和。

### 📊 本次工作流程 Token 用量（強制輸出，不可省略）

⛔ **只跑指令、沒把表格貼進可見回覆 = 未完成。**
⛔ **這不是流程的結尾。** 貼出表格之後，仍須執行 Phase 5 後置清理並輸出其狀態行，該狀態行才是回覆的最後一行。
Bash 的 stdout **不會自動顯示給使用者**，必須由你親手複製貼出。嚴格依序：

1. 以 **Bash 工具**執行（此步只取得資料，使用者還看不到）：

   ```bash
   node .claude/scripts/token-usage/token_usage.js report unit 2>/dev/null
   ```

2. **立即在你的回覆中，把該指令 stdout 的整段 Markdown 表格（從 `### 📊 本次測試工作流程 Token 用量` 到 `>` 開頭的備註）一字不改、完整貼出**，作為給使用者看的最終結果。
3. ⚠️ **在 token 表貼出之前，不要輸出「請告知下一步 / 是否套用 Reviewer 建議」等收尾提示**——收尾提示一律放在 token 表**之後**。
4. 只有當指令真的無輸出或失敗（本機未產生 transcript）時，才可略過本段。

> 自我檢查（結束前必問）：**「我是否已把 report 指令的 stdout 表格貼進可見回覆？」** 若否 → 立即補貼，不得結束。

> **表格缺席時的判讀**：Token 表格缺席**不代表流程異常** —— 四階段的成敗一律以 Executor 回報與磁碟狀態為準。缺席只代表本次沒有 token 資料可看；transcript 仍在，使用者可自行執行 `node .claude/scripts/token-usage/token_usage.js report unit` 補取。**不得因表格缺席而重跑整個工作流程。**

- 統計涵蓋 Orchestrator 主執行緒 ＋ 本次所有 `dotnet-testing-*` subagent；input 分純 input／cache 寫入／cache 讀取，另有含快取合計與 output。
- 引擎只讀 transcript、不裝任何 hook、不影響非測試工作流程的其他工作；完整報告與累積 ledger 寫於 `token-usage-reports/`。詳見 `docs/TOKEN_USAGE_GUIDE.md`。

---

## 修改流程（Modification Workflow）

### 觸發條件

當使用者要求套用 Reviewer 建議、修改既有測試、或增加測試案例時，使用此流程（而非重新執行完整四階段）。

> **Production 重構 opt-in（Legacy 跨平台）**：當 Reviewer 回傳 `productionRefactorOptIn` 欄位時（被測類別有硬編絕對路徑 + 直接 File.IO + 無 IFileSystem），Orchestrator 在結果中**顯著呈現此建議**，並明確告知這是**需使用者同意才執行的 production code 修改**（注入 `IFileSystem`）。
> - **預設不修改 production**。流程照常產出當下可用的測試（在 Windows 上可跑的 Characterization Test），絕不自動改 production。
> - 僅當**使用者明確同意**後，才啟動針對性修改：先讓 Writer/Executor 修改 production（建構式注入 `IFileSystem`、以 `_fileSystem.*` 取代直接 `File.*`），再重寫測試改用 `MockFileSystem`。此修改**會動到 `src/` 生產程式碼**，屬此流程的特例（一般修改流程禁止改 production）。

### 流程（三階段）

1. **Writer（修改模式）** — 傳遞 Reviewer 建議內容，讓 Writer 修改既有測試程式碼
2. **Executor** — 建置並執行修改後的測試，確認全數通過
3. **Reviewer（re-review 模式）** — 以 `mode: "re-review"` 聚焦驗證前次建議是否正確套用，並給出修改後評分

### 觸發方式

Reviewer 回傳後，Orchestrator **一律呈現完整結果**（包含 `issues`、`missingTestCases`、`overallScore`），然後**等待使用者指示**。

**禁止自動觸發修改流程。** 無論評分高低、是否有 error 級 issue，修改流程的啟動權完全屬於使用者。

Orchestrator 應在結果呈現的最後，提示使用者可用的操作：

> 如需套用 Reviewer 建議，請告知要套用哪些項目（或全部套用），我將啟動修改流程。

**多目標場景**：逐個目標獨立呈現結果，使用者可針對個別目標要求修改。

### 啟動 Writer 時的額外資訊

當使用者要求啟動修改流程時，除了交接檔案路徑外，還需傳遞：

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

1. 修改前後的測試數量變化（例：25 → 31）
2. 套用了哪些 Reviewer 建議
3. 重新評分結果（例：B+ → A）

修改流程結果呈現後，**同樣執行 token 用量統計並親手貼出表格**（規則同主路徑「強制輸出」）：先以 Bash 工具執行下列指令，再把其 stdout 的整段 Markdown 表格**一字不改貼進可見回覆**（⛔ 只跑不貼 = 未完成）；收尾提示放在表格之後。表格與收尾提示之後，**仍須執行 Phase 5 後置清理並輸出其狀態行**，該狀態行才是回覆的最後一行。

```bash
node .claude/scripts/token-usage/token_usage.js report unit 2>/dev/null
```

> 因計量起點 marker 不變，這次輸出的是**含本次修改的累計用量**（與初始 run 同一筆 ledger，數字累加）。

---

## 錯誤處理

### Analyzer 失敗

如果 Analyzer 找不到被測試目標或分析失敗：

1. 向使用者確認檔案路徑是否正確
2. 自己嘗試用 `Read` 和 `Grep` 工具找到目標檔案
3. 重新啟動 Analyzer

### Executor 修正後仍有失敗

如果 Executor 經過 3 輪修正後仍有測試失敗：

1. 將失敗訊息和 Executor 的分析一併傳給 Reviewer
2. 在最終結果中明確標示哪些測試失敗
3. 提供修正方向建議

---

## 多目標支援

當使用者一次指定多個被測試類別時，執行以下策略：

### Step 0：多目標偵測

解析使用者輸入，識別多個被測試目標。常見模式：

- 「幫 ProductService、OrderService、UserService 寫測試」
- 「測試 Services/ 下的所有類別」
- 列舉多個類別名稱或檔案路徑

如果偵測到多個目標，對每個目標分別執行完整的四階段流程，並採用以下平行策略：

### 多目標執行策略

| 階段 | 執行方式 | 說明 |
|------|---------|------|
| Phase 1 Analyzer | **平行** | 每個目標獨立分析，互不依賴，在同一回應中發出多個 Agent tool 呼叫 |
| Phase 2 Writer | **平行** | 每個目標獨立撰寫測試，在同一回應中發出多個 Agent tool 呼叫，每個 Writer 收到自己的分析報告 |
| Phase 3 Executor | **循序** | 同專案 `dotnet build` 不可並行，需依序執行每個測試檔案 |
| Phase 4 Reviewer | **平行** | 每份測試獨立審查，在同一回應中發出多個 Agent tool 呼叫 |

> **`.csproj` 競態收斂（多目標）**：多目標時各類別的 Writer 仍可能並行觸及同一 `.csproj`。Phase 3 Executor 為**循序**、且在所有 Writer 之後執行——它會在建置時補齊缺漏套件（CS0246 → 加套件、NU1101 → 移除錯誤套件），作為 `.csproj` 的**最終收斂點**。因此即使並行 Writer 的 `.csproj` 寫入有 lost-update，Executor 仍會修正。

### 多目標結果彙整

多目標完成後，在結果區塊中彙整呈現：

1. **概覽表格**：列出每個目標的測試數量、通過/失敗狀態、品質評分
2. **各目標詳細結果**：按目標分區展示（測試程式碼、執行結果、審查摘要）
3. **共用改善建議**：如果多個目標有相同的品質問題，合併建議

---

## 重要原則

1. **交接檔案路徑優先** — 傳遞 `analysisFilePath`、`writerResultFilePath`、`executorResultFilePath` 給 subagent，而非嵌入完整 JSON。Subagent 會在 Step 0 自行讀取交接檔案取得完整資訊
2. **保持 context 精簡** — 只保留 subagent 回傳的摘要，不展開中間過程
3. **`methodScenarioCounts` 供規模判讀** — 用此欄位掌握各方法的場景分佈，供進度顯示與結果彙整使用
4. **`suggestedTestScenarios` 必須是中文** — Analyzer 產出的建議測試命名必須使用中文三段式格式
