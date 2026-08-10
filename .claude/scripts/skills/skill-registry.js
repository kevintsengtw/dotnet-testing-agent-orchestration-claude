#!/usr/bin/env node
// -*- coding: utf-8 -*-
//
// skill-registry.js — Skill 路徑分類與正規化的單一事實來源（零依賴）
//
// 分類原則：
//   shared               共用技術 Skill，canonical 在 .agents/skills/<id>/SKILL.md
//   claude-orchestration Claude 專屬指揮中心 Skill，位於 .claude/skills/<id>/SKILL.md
//   claude-tool          Claude 專屬工具型 Skill（frontmatter 使用 allowed-tools 等 Claude 語意）
//
// 佈署模型（直接路徑）：subagent（Analyzer/Writer/Reviewer/Executor）以固定路徑用 Read 工具
// 載入 SKILL.md —— 共用技術 Skill 一律讀 .agents/skills/<id>/SKILL.md，Claude 專屬 Skill 讀
// .claude/skills/<id>/SKILL.md。共用 Skill 不再於 .claude/skills 下放連結或副本。
//
// canonicalizeSkillPath / dedupeSkillPaths 仍保留：把任何殘留的 .claude/skills/<shared> 路徑
// 正規化回 canonical，供 read-scope 稽核與 token 統計去重，避免同一 Skill 因路徑不同被重複計算。

"use strict";

const path = require("path");

const SHARED_SKILLS_ROOT = ".agents/skills";
const CLAUDE_SKILLS_ROOT = ".claude/skills";

/** 共用技術 Skill（canonical: .agents/skills） */
const SHARED_SKILLS = [
  "dotnet-testing",
  "dotnet-testing-advanced",
  "dotnet-testing-advanced-aspire-testing",
  "dotnet-testing-advanced-aspnet-integration-testing",
  "dotnet-testing-advanced-testcontainers-database",
  "dotnet-testing-advanced-testcontainers-nosql",
  "dotnet-testing-advanced-tunit-advanced",
  "dotnet-testing-advanced-tunit-fundamentals",
  "dotnet-testing-advanced-webapi-integration-testing",
  "dotnet-testing-advanced-xunit-upgrade-guide",
  "dotnet-testing-autodata-xunit-integration",
  "dotnet-testing-autofixture-basics",
  "dotnet-testing-autofixture-bogus-integration",
  "dotnet-testing-autofixture-customization",
  "dotnet-testing-autofixture-nsubstitute-integration",
  "dotnet-testing-awesome-assertions-guide",
  "dotnet-testing-bogus-fake-data",
  "dotnet-testing-code-coverage-analysis",
  "dotnet-testing-complex-object-comparison",
  "dotnet-testing-datetime-testing-timeprovider",
  "dotnet-testing-filesystem-testing-abstractions",
  "dotnet-testing-fluentvalidation-testing",
  "dotnet-testing-nsubstitute-mocking",
  "dotnet-testing-private-internal-testing",
  "dotnet-testing-test-data-builder-pattern",
  "dotnet-testing-test-naming-conventions",
  "dotnet-testing-test-output-logging",
  "dotnet-testing-unit-test-fundamentals",
  "dotnet-testing-xunit-project-setup",
];

/**
 * 外部來源的共用技術 Skill：分類上同屬 shared（canonical 亦在 .agents/skills），
 * 但**不隨本 repo 散佈**，由各自的專屬公開 repo 提供、使用者自行安裝。
 * 因此 doctor **不要求**它們實體存在，缺少時視為 info（可選），不報 error。
 *   - unit-test-scenarios → https://github.com/kevintsengtw/unit-test-scenarios
 * 這類 Skill 是 orchestrator 流程「外部」的輔助工具（產出 Test Scenarios 文件供採用機制吃），
 * 不被任何 subagent 以 Skill 形式載入。
 */
const EXTERNAL_SHARED_SKILLS = ["unit-test-scenarios"];

/** Claude 專屬 orchestration Skill（canonical: .claude/skills） */
const CLAUDE_ORCHESTRATION_SKILLS = [
  "dotnet-testing-orchestrator-unit",
  "dotnet-testing-orchestrator-integration",
  "dotnet-testing-orchestrator-aspire",
  "dotnet-testing-orchestrator-tunit",
];

/** Claude 專屬工具型 Skill（canonical: .claude/skills） */
const CLAUDE_TOOL_SKILLS = ["dotnet-test"];

// 分類用：bundled 共用 Skill ＋ 外部來源共用 Skill 都屬 "shared"
const SHARED_SET = new Set([...SHARED_SKILLS, ...EXTERNAL_SHARED_SKILLS]);
const EXTERNAL_SHARED_SET = new Set(EXTERNAL_SHARED_SKILLS);
const ORCH_SET = new Set(CLAUDE_ORCHESTRATION_SKILLS);
const TOOL_SET = new Set(CLAUDE_TOOL_SKILLS);

/** 是否為外部來源（不隨本 repo 散佈）的共用 Skill。 */
function isExternalSharedSkill(idOrAliasOrPath) {
  const fromPath = resolveSkillIdFromPath(idOrAliasOrPath);
  return EXTERNAL_SHARED_SET.has(normalizeSkillId(fromPath || idOrAliasOrPath));
}

/**
 * 技術識別碼 → Skill 名稱。
 * Analyzer 產出的 requiredTechniques / requiredSkills / skillMap 使用短識別碼，
 * 這裡把短識別碼對應到 canonical Skill 名稱（Skill 名稱本身也視為合法輸入）。
 */
const TECHNIQUE_ALIASES = {
  // unit
  "unit-test-fundamentals": "dotnet-testing-unit-test-fundamentals",
  "test-naming-conventions": "dotnet-testing-test-naming-conventions",
  "xunit-project-setup": "dotnet-testing-xunit-project-setup",
  "nsubstitute-mocking": "dotnet-testing-nsubstitute-mocking",
  "autofixture-basics": "dotnet-testing-autofixture-basics",
  "autofixture-customization": "dotnet-testing-autofixture-customization",
  "bogus-fake-data": "dotnet-testing-bogus-fake-data",
  "test-data-builder-pattern": "dotnet-testing-test-data-builder-pattern",
  "autofixture-bogus-integration": "dotnet-testing-autofixture-bogus-integration",
  "autofixture-nsubstitute-integration": "dotnet-testing-autofixture-nsubstitute-integration",
  "autodata-xunit-integration": "dotnet-testing-autodata-xunit-integration",
  "awesome-assertions": "dotnet-testing-awesome-assertions-guide",
  "awesome-assertions-guide": "dotnet-testing-awesome-assertions-guide",
  "complex-object-comparison": "dotnet-testing-complex-object-comparison",
  "fluentvalidation-testing": "dotnet-testing-fluentvalidation-testing",
  "datetime-testing-timeprovider": "dotnet-testing-datetime-testing-timeprovider",
  "filesystem-testing-abstractions": "dotnet-testing-filesystem-testing-abstractions",
  "private-internal-testing": "dotnet-testing-private-internal-testing",
  "test-output-logging": "dotnet-testing-test-output-logging",
  "code-coverage-analysis": "dotnet-testing-code-coverage-analysis",
  // integration / aspire / tunit
  "webapi-integration-testing": "dotnet-testing-advanced-webapi-integration-testing",
  "aspnet-integration-testing": "dotnet-testing-advanced-aspnet-integration-testing",
  "testcontainers-database": "dotnet-testing-advanced-testcontainers-database",
  "testcontainers-nosql": "dotnet-testing-advanced-testcontainers-nosql",
  "aspire-testing": "dotnet-testing-advanced-aspire-testing",
  "tunit-fundamentals": "dotnet-testing-advanced-tunit-fundamentals",
  "tunit-advanced": "dotnet-testing-advanced-tunit-advanced",
  "xunit-upgrade-guide": "dotnet-testing-advanced-xunit-upgrade-guide",
};

/**
 * 角色 read-scope 允許清單（以 Skill ID 分類，非路徑前綴）。
 * `dynamic: true` 表示該角色實際載入的 Skill 由 Analyzer 產出的 requiredSkills 決定，
 * 但仍必須落在 `shared` 清單內；清單外的 Skill 一律拒絕。
 */
const ROLE_READ_SCOPE = {
  // Orchestrator：只能讀自己的 orchestration Skill，不得載入任何技術型 Skill
  "dotnet-testing-orchestrator-unit": { orchestration: ["dotnet-testing-orchestrator-unit"], shared: [], dynamic: false },
  "dotnet-testing-orchestrator-integration": { orchestration: ["dotnet-testing-orchestrator-integration"], shared: [], dynamic: false },
  "dotnet-testing-orchestrator-aspire": { orchestration: ["dotnet-testing-orchestrator-aspire"], shared: [], dynamic: false },
  "dotnet-testing-orchestrator-tunit": { orchestration: ["dotnet-testing-orchestrator-tunit"], shared: [], dynamic: false },

  // Unit workflow
  "dotnet-testing-analyzer": { orchestration: [], shared: [], dynamic: false },
  "dotnet-testing-writer": {
    orchestration: [],
    dynamic: true,
    shared: [
      "dotnet-testing-unit-test-fundamentals",
      "dotnet-testing-test-naming-conventions",
      "dotnet-testing-xunit-project-setup",
      "dotnet-testing-nsubstitute-mocking",
      "dotnet-testing-autofixture-basics",
      "dotnet-testing-autofixture-customization",
      "dotnet-testing-bogus-fake-data",
      "dotnet-testing-test-data-builder-pattern",
      "dotnet-testing-autofixture-bogus-integration",
      "dotnet-testing-autofixture-nsubstitute-integration",
      "dotnet-testing-autodata-xunit-integration",
      "dotnet-testing-awesome-assertions-guide",
      "dotnet-testing-complex-object-comparison",
      "dotnet-testing-fluentvalidation-testing",
      "dotnet-testing-datetime-testing-timeprovider",
      "dotnet-testing-filesystem-testing-abstractions",
      "dotnet-testing-private-internal-testing",
      "dotnet-testing-test-output-logging",
      "dotnet-testing-code-coverage-analysis",
    ],
  },
  "dotnet-testing-reviewer": {
    orchestration: [],
    dynamic: true,
    shared: [
      "dotnet-testing-test-naming-conventions",
      "dotnet-testing-awesome-assertions-guide",
      "dotnet-testing-unit-test-fundamentals",
      "dotnet-testing-nsubstitute-mocking",
      "dotnet-testing-complex-object-comparison",
      "dotnet-testing-code-coverage-analysis",
    ],
  },
  "dotnet-testing-executor": { orchestration: [], shared: [], tool: ["dotnet-test"], dynamic: false },

  // Integration workflow
  "dotnet-testing-advanced-integration-analyzer": { orchestration: [], shared: [], dynamic: false },
  "dotnet-testing-advanced-integration-writer": {
    orchestration: [],
    dynamic: true,
    shared: [
      "dotnet-testing-advanced-webapi-integration-testing",
      "dotnet-testing-advanced-aspnet-integration-testing",
      "dotnet-testing-advanced-testcontainers-database",
      "dotnet-testing-advanced-testcontainers-nosql",
    ],
  },
  "dotnet-testing-advanced-integration-reviewer": {
    orchestration: [],
    dynamic: true,
    shared: [
      "dotnet-testing-test-naming-conventions",
      "dotnet-testing-awesome-assertions-guide",
      "dotnet-testing-advanced-webapi-integration-testing",
      "dotnet-testing-advanced-aspnet-integration-testing",
      "dotnet-testing-advanced-testcontainers-database",
      "dotnet-testing-advanced-testcontainers-nosql",
    ],
  },
  "dotnet-testing-advanced-integration-executor": { orchestration: [], shared: [], tool: [], dynamic: false },

  // Aspire workflow
  "dotnet-testing-advanced-aspire-analyzer": { orchestration: [], shared: [], dynamic: false },
  "dotnet-testing-advanced-aspire-writer": {
    orchestration: [],
    dynamic: true,
    shared: ["dotnet-testing-advanced-aspire-testing"],
  },
  "dotnet-testing-advanced-aspire-reviewer": {
    orchestration: [],
    dynamic: true,
    shared: [
      "dotnet-testing-test-naming-conventions",
      "dotnet-testing-awesome-assertions-guide",
      "dotnet-testing-advanced-aspire-testing",
    ],
  },
  "dotnet-testing-advanced-aspire-executor": { orchestration: [], shared: [], tool: [], dynamic: false },

  // TUnit workflow
  "dotnet-testing-advanced-tunit-analyzer": { orchestration: [], shared: [], dynamic: false },
  "dotnet-testing-advanced-tunit-writer": {
    orchestration: [],
    dynamic: true,
    shared: ["dotnet-testing-advanced-tunit-fundamentals", "dotnet-testing-advanced-tunit-advanced"],
  },
  "dotnet-testing-advanced-tunit-reviewer": {
    orchestration: [],
    dynamic: true,
    shared: [
      "dotnet-testing-test-naming-conventions",
      "dotnet-testing-awesome-assertions-guide",
      "dotnet-testing-advanced-tunit-fundamentals",
      "dotnet-testing-advanced-tunit-advanced",
    ],
  },
  "dotnet-testing-advanced-tunit-executor": { orchestration: [], shared: [], tool: [], dynamic: false },
};

/** 把 Windows 反斜線與 ./ 前綴正規化為 posix 相對路徑。 */
function toPosix(p) {
  return String(p).replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * 由任意 Skill 路徑取出 Skill ID。
 * 同時接受 `.agents/skills/<id>/...`（canonical）與 `.claude/skills/<id>/...`（相容連結），
 * 也接受絕對路徑。無法辨識時回傳 null。
 */
function resolveSkillIdFromPath(p) {
  if (!p) return null;
  const posix = toPosix(p);
  const m = posix.match(/(?:^|\/)\.(?:agents|claude)\/skills\/([^/]+)(?:\/|$)/);
  return m ? m[1] : null;
}

/** 技術識別碼或 Skill 名稱 → Skill 名稱。無法辨識時原樣回傳。 */
function normalizeSkillId(idOrAlias) {
  if (!idOrAlias) return null;
  const raw = String(idOrAlias).trim();
  if (SHARED_SET.has(raw) || ORCH_SET.has(raw) || TOOL_SET.has(raw)) return raw;
  return TECHNIQUE_ALIASES[raw] || raw;
}

/** 分類：shared / claude-orchestration / claude-tool / unknown */
function classifySkill(idOrAliasOrPath) {
  const fromPath = resolveSkillIdFromPath(idOrAliasOrPath);
  const id = normalizeSkillId(fromPath || idOrAliasOrPath);
  if (SHARED_SET.has(id)) return "shared";
  if (ORCH_SET.has(id)) return "claude-orchestration";
  if (TOOL_SET.has(id)) return "claude-tool";
  return "unknown";
}

/** Skill 的 canonical 目錄（相對 repo root，posix）。unknown 回傳 null。 */
function canonicalSkillDir(idOrAliasOrPath) {
  const fromPath = resolveSkillIdFromPath(idOrAliasOrPath);
  const id = normalizeSkillId(fromPath || idOrAliasOrPath);
  const kind = classifySkill(id);
  if (kind === "shared") return `${SHARED_SKILLS_ROOT}/${id}`;
  if (kind === "claude-orchestration" || kind === "claude-tool") return `${CLAUDE_SKILLS_ROOT}/${id}`;
  return null;
}

/** Skill 的 canonical SKILL.md 路徑。unknown 回傳 null。 */
function canonicalSkillPath(idOrAliasOrPath) {
  const dir = canonicalSkillDir(idOrAliasOrPath);
  return dir ? `${dir}/SKILL.md` : null;
}

/**
 * 把實際讀取到的路徑正規化為 canonical 路徑。
 * 例如殘留的 `.claude/skills/dotnet-testing-nsubstitute-mocking/SKILL.md` 會被正規化為
 * `.agents/skills/dotnet-testing-nsubstitute-mocking/SKILL.md`（共用 Skill 的 canonical 位置）。
 * 不是 Skill 路徑時原樣回傳（只做分隔符正規化）。
 */
function canonicalizeSkillPath(p) {
  const posix = toPosix(p);
  const id = resolveSkillIdFromPath(posix);
  if (!id) return posix;
  const dir = canonicalSkillDir(id);
  if (!dir) return posix;
  const tail = posix.replace(/^.*?\.(?:agents|claude)\/skills\/[^/]+\/?/, "");
  return tail ? `${dir}/${tail}` : dir;
}

/**
 * 對「實際讀取檔案清單」去重：symlink／junction 與 canonical 路徑視為同一項，只保留一次。
 * 非 Skill 路徑照原樣去重。回傳 canonical 路徑陣列，維持首次出現順序。
 */
function dedupeSkillPaths(paths) {
  const seen = new Set();
  const out = [];
  for (const p of paths || []) {
    const c = canonicalizeSkillPath(p);
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/** 角色的 read-scope 設定。未註冊角色回傳 null。 */
function readScopeFor(role) {
  return ROLE_READ_SCOPE[role] || null;
}

/**
 * 判斷角色是否可讀取某個 Skill（以 Skill ID 判斷，不用路徑前綴放行）。
 * 回傳 { allowed: boolean, reason: string, skillId, kind }。
 */
function isSkillReadAllowed(role, idOrAliasOrPath) {
  const scope = readScopeFor(role);
  const fromPath = resolveSkillIdFromPath(idOrAliasOrPath);
  const skillId = normalizeSkillId(fromPath || idOrAliasOrPath);
  const kind = classifySkill(skillId);

  if (!scope) return { allowed: false, reason: `未註冊的角色：${role}`, skillId, kind };
  if (kind === "unknown") return { allowed: false, reason: `未知的 Skill：${skillId}`, skillId, kind };

  const allow =
    kind === "shared"
      ? scope.shared || []
      : kind === "claude-orchestration"
        ? scope.orchestration || []
        : scope.tool || [];

  if (allow.includes(skillId)) return { allowed: true, reason: "在角色允許清單內", skillId, kind };
  return { allowed: false, reason: `${role} 的 read-scope 不允許 ${kind} Skill：${skillId}`, skillId, kind };
}

module.exports = {
  SHARED_SKILLS_ROOT,
  CLAUDE_SKILLS_ROOT,
  SHARED_SKILLS,
  EXTERNAL_SHARED_SKILLS,
  CLAUDE_ORCHESTRATION_SKILLS,
  CLAUDE_TOOL_SKILLS,
  isExternalSharedSkill,
  TECHNIQUE_ALIASES,
  ROLE_READ_SCOPE,
  toPosix,
  resolveSkillIdFromPath,
  normalizeSkillId,
  classifySkill,
  canonicalSkillDir,
  canonicalSkillPath,
  canonicalizeSkillPath,
  dedupeSkillPaths,
  readScopeFor,
  isSkillReadAllowed,
};
