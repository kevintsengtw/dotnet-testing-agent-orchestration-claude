# Skill 目錄配置與部署契約

本文件定義共用技術 Skills 與 Claude 專屬 Skills 的 canonical location、載入方式，以及 VS Code Extension／installer 必須配合的部署契約。

---

## 1. 兩類 Skill

| 類型 | canonical location | 說明 |
| --- | --- | --- |
| **共用技術 Skill**（shared） | `.agents/skills/<skill-name>/SKILL.md` | .NET 測試技術知識庫。跨 Agent 生態共用，不綁定任何特定 AI Coding Agent |
| **Claude 專屬 orchestration Skill** | `.claude/skills/<skill-name>/SKILL.md` | 指揮中心，使用 Claude Code 的 subagent、hooks、Agent tool 語意 |
| **Claude 專屬工具型 Skill** | `.claude/skills/<skill-name>/SKILL.md` | frontmatter 使用 `allowed-tools` 等 Claude Code 語意 |

> 目錄名稱是 **`.agents`（複數）**，不是 `.agent`。

### 分類清單（單一事實來源）

實際清單由 [`.claude/scripts/skills/skill-registry.js`](../.claude/scripts/skills/skill-registry.js) 定義，文件僅為摘要：

- **共用技術 Skill（bundled，29 個）**：29 個 `dotnet-testing-*` 技術 Skill（不含 orchestrator），隨本 repo 散佈
- **外部來源共用 Skill（1 個）**：`unit-test-scenarios` —— 分類同屬 shared、canonical 亦在 `.agents/skills`，但**不隨本 repo 散佈**，由專屬公開 repo [kevintsengtw/unit-test-scenarios](https://github.com/kevintsengtw/unit-test-scenarios) 提供、使用者自行安裝。它是 orchestrator 流程**外部**的輔助工具（產出 Test Scenarios 文件供採用機制吃），不被任何 subagent 以 Skill 形式載入。`skills-doctor` 不要求它實體存在（缺席為 info，非 error）
- **Claude 專屬 orchestration Skill（4 個）**：`dotnet-testing-orchestrator-unit` / `-integration` / `-aspire` / `-tunit`
- **Claude 專屬工具型 Skill（1 個）**：`dotnet-test`

新增 Skill 時**必須**同步更新 registry，否則 `skills-doctor` 會回報 `UNREGISTERED_*` warning。

---

## 2. 載入方式：直接路徑，不需相容連結

subagent（Analyzer / Writer / Reviewer / Executor）以 `Read` 工具、**固定路徑**載入 SKILL.md：

- 共用技術 Skill → `.agents/skills/<skill-name>/SKILL.md`
- Claude 專屬 Skill → `.claude/skills/<skill-name>/SKILL.md`

因為載入走的是 subagent 的 `Read` 工具（可讀任意路徑），**不依賴** Claude Code 的原生 Skill 掃描，所以共用技術 Skill **不需要**在 `.claude/skills` 下放連結或副本。`.claude/skills` 只保留 4 個 orchestrator（由 `/` 斜線指令觸發）與 `dotnet-test`（Executor 以路徑載入）。

Agent 定義中的 Skill 表格直接列出 `.agents/skills/<name>/SKILL.md` 路徑；Analyzer 產出的 `requiredTechniques` / `requiredSkills` / `skillMap` 仍使用既有的**短識別碼**（如 `nsubstitute-mocking`），識別碼 → 路徑的對應在各 agent 定義的表格中，也記於 registry 的 `TECHNIQUE_ALIASES`。Skill selection 邏輯本身未改變。

> **為什麼不用 `.claude/skills` 相容連結？** 早期版本曾在 `.claude/skills` 放 junction／symlink 讓 Claude Code 原生掃描發現共用 Skill。但 subagent 本來就以固定路徑 `Read` 載入，連結是多餘的一層，還會造成「同一 Skill 兩份路徑」的去重與稽核負擔。改為直接指向 `.agents/skills` 後這層完全移除。

### 驗證

```bash
node .claude/scripts/skills/skills-doctor.js          # 完整檢查，有錯誤時離開碼 1
node .claude/scripts/skills/skills-doctor.js --json    # 機器可讀輸出
```

檢查項目與錯誤代碼：

| 代碼 | 意義 |
| --- | --- |
| `SHARED_CANONICAL_MISSING` | 共用 Skill 缺少 `.agents/skills/<id>/SKILL.md` |
| `SHARED_SKILL_IN_CLAUDE_ROOT` | 共用 Skill 出現在 `.claude/skills/<id>`（連結或副本）→ 重複來源，附移除指令 |
| `CLAUDE_SKILL_MISSING` | Claude 專屬 Skill 缺少 `.claude/skills/<id>/SKILL.md` |
| `CLAUDE_SKILL_IN_SHARED_ROOT` | Claude 專屬 Skill 被誤搬到 `.agents/skills` |
| `HARDCODED_SHARED_SKILL_PATH` | agent 定義或 orchestration Skill 用了共用 Skill 的 `.claude/skills/...` 路徑（應為 `.agents/skills/...`） |
| `UNREGISTERED_SHARED_SKILL` / `UNREGISTERED_CLAUDE_SKILL` | 磁碟上的 Skill 目錄未登記在 registry（warning） |

---

## 3. read-scope 與 token 去重

### read-scope 以 Skill ID 判斷，不用路徑前綴放行

`skill-registry.js` 的 `ROLE_READ_SCOPE` 為每個角色列出允許的 Skill ID：

| 角色 | 允許載入 |
| --- | --- |
| Orchestrator（4 個） | 只有自己那一個 orchestration Skill；**任何**技術型 Skill 都不允許 |
| Analyzer（4 個） | 不載入任何技術型 Skill（只產出識別碼） |
| Writer（4 個） | 該 workflow 的實作 Skill，依 Analyzer 的 `requiredSkills` 動態選擇 |
| Reviewer（4 個） | 該 workflow 的審查 Skill |
| Executor（unit） | 只有 `dotnet-test` |
| Executor（integration／aspire／tunit） | 不載入任何 Skill |

`isSkillReadAllowed(role, idOrPath)` 對路徑與短識別碼一律先正規化為 Skill ID 再比對，**換一條路徑不會繞過限制**。

### token 去重

`canonicalizeSkillPath()` 會把任何殘留的 `.claude/skills/<shared>/...` 正規化為 `.agents/skills/<shared>/...`；`dedupeSkillPaths()` 以正規化後的路徑去重。正常佈局下共用 Skill 只有 `.agents/skills` 一條路徑，這兩個函式作為防禦層存在——即使稽核輸入混入了舊路徑，同一 Skill 也只計算一次。

---

## 4. 部署契約（VS Code Extension／installer 必須配合）

本 repository 只負責 Claude workflow 定義，**不實作 installer**。installer 必須滿足：

1. **共用技術 Skills 的 canonical source 是 `.agents/skills/<skill-name>/SKILL.md`**，以此為安裝與更新的來源。
2. **Claude 專屬 orchestration／工具型 Skills 直接部署到 `.claude/skills/<skill-name>`**，不經 `.agents/skills`。
3. **不需要**在 `.claude/skills` 下為共用 Skill 建立 symlink／junction 或副本 —— subagent 以固定路徑 `.agents/skills/<name>/SKILL.md` 載入。若 installer 仍建立了這類連結，`skills-doctor` 會回報 `SHARED_SKILL_IN_CLAUDE_ROOT` 並提供移除指令。
4. installer 若要提供部署後檢查，可直接重用本 repo 的 `skills-doctor.js`（零依賴、Windows／POSIX 皆可）。

> **相容性邊界**：若某個 Claude Code 版本或情境需要共用 Skill 也能被原生 Skill 掃描發現（例如以 `/` 斜線指令或 Skill 工具直接叫用共用 Skill），才需要 installer 另行建立 `.claude/skills` 連結。本 workflow 的四種測試流程不依賴此能力：共用 Skill 一律由 subagent 以 `.agents/skills` 路徑載入。

---

## 5. 已知限制

- `skills:` frontmatter 預載**刻意未使用**：Writer／Reviewer 的 Skill 組合是 Analyzer 依目標動態決定的，全部預載會破壞 progressive disclosure、增加 token 消耗，並改變既有 read-scope 契約。
- 共用技術 Skill 以固定路徑載入，因此 `.agents/skills` 必須與 agent 定義位於同一 workspace 根目錄下（相對路徑 `.agents/skills/...` 從 workspace 根解析）。
