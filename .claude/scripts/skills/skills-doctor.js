#!/usr/bin/env node
// -*- coding: utf-8 -*-
//
// skills-doctor.js — 驗證 Skill 佈署配置（零依賴）
//
// 用法：
//   node .claude/scripts/skills/skills-doctor.js [--root <repo>] [--json]
//
// 佈署模型（直接路徑）：
//   - 共用技術 Skill 的 canonical 且唯一來源是 .agents/skills/<id>/SKILL.md
//   - Agent 定義（subagent）以固定路徑 `.agents/skills/<id>/SKILL.md` 用 Read 工具載入，
//     不經 Claude Code 的 Skill 掃描，因此 .claude/skills 下不再需要共用 Skill 的連結或副本
//   - Claude 專屬 Skill（4 個 orchestrator + dotnet-test）直接位於 .claude/skills/<id>/SKILL.md
//
// 檢查項目：
//   1. 每個共用技術 Skill 都有 canonical 來源 .agents/skills/<id>/SKILL.md
//   2. 共用技術 Skill 不得出現在 .claude/skills（連結或實體目錄皆算重複來源）
//   3. 每個 Claude 專屬 Skill 都在 .claude/skills/<id>/SKILL.md
//   4. Claude 專屬 orchestration Skill 沒有被誤搬到 .agents/skills
//   5. agent 定義與 orchestration Skill 內沒有殘留 `.claude/skills/<共用 Skill>` 硬編碼路徑
//      （共用 Skill 的路徑必須是 .agents/skills/...）
//   6. 磁碟上的 Skill 目錄與 registry 沒有漂移
//
// 離開碼：0 = 全部通過（可含 warning）；1 = 有 error。

"use strict";

const fs = require("fs");
const path = require("path");
const R = require("./skill-registry.js");

function parseArgs(argv) {
  const opts = { root: process.cwd(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") opts.root = argv[++i];
    else if (a === "--json") opts.json = true;
  }
  return opts;
}

function exists(p) {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

function isLink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function listDirs(p) {
  try {
    return fs
      .readdirSync(p, { withFileTypes: true })
      .filter((e) => e.isDirectory() || e.isSymbolicLink())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

function collectMarkdownFiles(root) {
  const files = [];
  const agentsDir = path.join(root, ".claude", "agents");
  for (const f of fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir) : []) {
    if (f.endsWith(".md")) files.push(path.join(agentsDir, f));
  }
  for (const id of R.CLAUDE_ORCHESTRATION_SKILLS.concat(R.CLAUDE_TOOL_SKILLS)) {
    const p = path.join(root, ".claude", "skills", id, "SKILL.md");
    if (fs.existsSync(p)) files.push(p);
  }
  return files;
}

function diagnose(root) {
  const errors = [];
  const warnings = [];
  const info = [];
  const add = (list, code, message, fix) => list.push(fix ? { code, message, fix } : { code, message });

  const sharedRoot = path.join(root, ".agents", "skills");
  const claudeRoot = path.join(root, ".claude", "skills");

  // 1 + 2. 共用 Skill：canonical 存在，且不得出現在 .claude/skills
  for (const id of R.SHARED_SKILLS) {
    const canonical = path.join(sharedRoot, id, "SKILL.md");
    if (!fs.existsSync(canonical)) {
      add(errors, "SHARED_CANONICAL_MISSING", `共用技術 Skill 缺少 canonical 來源：.agents/skills/${id}/SKILL.md`);
    }
    const strayInClaude = path.join(claudeRoot, id);
    if (exists(strayInClaude)) {
      const kind = isLink(strayInClaude) ? "相容連結" : "實體目錄";
      add(
        errors,
        "SHARED_SKILL_IN_CLAUDE_ROOT",
        `共用技術 Skill 不應出現在 .claude/skills/${id}（${kind}）；canonical 為 .agents/skills/${id}，agent 以該路徑直接載入`,
        `rm "${path.join(".claude", "skills", id)}"（僅移除 .claude/skills 下的連結/副本，不影響 .agents/skills 的來源）`
      );
    } else {
      info.push({ code: "SHARED_SKILL_CANONICAL_ONLY", message: `.agents/skills/${id}（未出現在 .claude/skills）` });
    }
  }

  // 2.5 外部來源共用 Skill：不隨本 repo 散佈，由專屬公開 repo 提供、使用者自行安裝。
  //     canonical 亦為 .agents/skills；缺少時視為 info（可選），僅在誤放 .claude/skills 時報錯。
  for (const id of R.EXTERNAL_SHARED_SKILLS) {
    const strayInClaude = path.join(claudeRoot, id);
    if (exists(strayInClaude)) {
      const kind = isLink(strayInClaude) ? "相容連結" : "實體目錄";
      add(
        errors,
        "SHARED_SKILL_IN_CLAUDE_ROOT",
        `外部共用 Skill 不應出現在 .claude/skills/${id}（${kind}）；canonical 為 .agents/skills/${id}`,
        `rm "${path.join(".claude", "skills", id)}"`
      );
    } else if (fs.existsSync(path.join(sharedRoot, id, "SKILL.md"))) {
      info.push({ code: "EXTERNAL_SHARED_SKILL_PRESENT", message: `.agents/skills/${id}（外部來源，已安裝）` });
    } else {
      info.push({
        code: "EXTERNAL_SHARED_SKILL_ABSENT",
        message: `.agents/skills/${id} 未安裝（外部來源，可選；由專屬公開 repo 提供）`,
      });
    }
  }

  // 3 + 4. Claude 專屬 Skill
  for (const id of R.CLAUDE_ORCHESTRATION_SKILLS.concat(R.CLAUDE_TOOL_SKILLS)) {
    const p = path.join(claudeRoot, id, "SKILL.md");
    if (!fs.existsSync(p)) {
      add(errors, "CLAUDE_SKILL_MISSING", `Claude 專屬 Skill 缺少：.claude/skills/${id}/SKILL.md`);
    }
    if (exists(path.join(sharedRoot, id))) {
      add(
        errors,
        "CLAUDE_SKILL_IN_SHARED_ROOT",
        `Claude 專屬 Skill 被誤放到共用目錄：.agents/skills/${id}（canonical 應為 .claude/skills/${id}）`
      );
    }
  }

  // 5. 硬編碼路徑掃描：共用 Skill 只能以 .agents/skills 路徑出現
  for (const file of collectMarkdownFiles(root)) {
    const rel = R.toPosix(path.relative(root, file));
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      const re = /\.claude\/skills\/([a-z0-9-]+)/g;
      let m;
      while ((m = re.exec(line)) !== null) {
        if (R.classifySkill(m[1]) === "shared") {
          add(
            errors,
            "HARDCODED_SHARED_SKILL_PATH",
            `${rel}:${i + 1} 引用共用 Skill 的錯誤路徑 .claude/skills/${m[1]}；共用 Skill 的 canonical path 是 .agents/skills/${m[1]}`
          );
        }
      }
    });
  }

  // 6. registry 漂移
  for (const name of listDirs(sharedRoot)) {
    if (R.classifySkill(name) !== "shared") {
      add(warnings, "UNREGISTERED_SHARED_SKILL", `.agents/skills/${name} 不在 registry 的共用 Skill 清單中`);
    }
  }
  for (const name of listDirs(claudeRoot)) {
    const kind = R.classifySkill(name);
    if (kind === "unknown") {
      add(warnings, "UNREGISTERED_CLAUDE_SKILL", `.claude/skills/${name} 不在 registry 中`);
    }
  }

  return { errors, warnings, info };
}

function main(argv) {
  const opts = parseArgs(argv);
  const result = diagnose(opts.root);
  if (opts.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    const { errors, warnings, info } = result;
    console.log(`Skill 佈署檢查（root: ${opts.root}）`);
    console.log(
      `  共用技術 Skill：${R.SHARED_SKILLS.length} bundled + ${R.EXTERNAL_SHARED_SKILLS.length} 外部來源（canonical .agents/skills，直接路徑載入）`
    );
    console.log(
      `  Claude 專屬 Skill：${R.CLAUDE_ORCHESTRATION_SKILLS.length} orchestration + ${R.CLAUDE_TOOL_SKILLS.length} tool（canonical .claude/skills）`
    );
    console.log(`  共用 Skill 僅存在於 canonical：${info.filter((x) => x.code === "SHARED_SKILL_CANONICAL_ONLY").length}`);
    for (const w of warnings) console.log(`  [WARN ] ${w.code}: ${w.message}${w.fix ? `\n          修正：${w.fix}` : ""}`);
    for (const e of errors) console.log(`  [ERROR] ${e.code}: ${e.message}${e.fix ? `\n          修正：${e.fix}` : ""}`);
    console.log(errors.length === 0 ? "OK：Skill 佈署配置正確。" : `FAIL：${errors.length} 個錯誤。`);
  }
  return result.errors.length === 0 ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { diagnose, main, parseArgs };
