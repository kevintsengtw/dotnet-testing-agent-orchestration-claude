#!/usr/bin/env node
// -*- coding: utf-8 -*-
//
// skills.test.js — skill-registry / skills-doctor 的單元測試（純 Node assert，零依賴）
// 執行：node .claude/scripts/skills/skills.test.js

"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const R = require("./skill-registry.js");
const doctor = require("./skills-doctor.js");

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push({ name, err });
  }
}

// ---------------------------------------------------------------- 路徑分類

test("classifySkill：共用技術 Skill 分類為 shared", () => {
  assert.strictEqual(R.classifySkill("dotnet-testing-nsubstitute-mocking"), "shared");
  assert.strictEqual(R.classifySkill("dotnet-testing-advanced-aspire-testing"), "shared");
});

test("外部來源共用 Skill：unit-test-scenarios 分類為 shared 但屬外部、不在 bundled 清單", () => {
  assert.strictEqual(R.classifySkill("unit-test-scenarios"), "shared");
  assert.strictEqual(R.isExternalSharedSkill("unit-test-scenarios"), true);
  assert.strictEqual(R.isExternalSharedSkill(".agents/skills/unit-test-scenarios/SKILL.md"), true);
  assert.ok(!R.SHARED_SKILLS.includes("unit-test-scenarios"), "不在 bundled SHARED_SKILLS");
  assert.ok(R.EXTERNAL_SHARED_SKILLS.includes("unit-test-scenarios"));
  assert.strictEqual(R.isExternalSharedSkill("dotnet-testing-nsubstitute-mocking"), false);
});

test("classifySkill：orchestration 與 tool Skill 屬於 Claude 專屬", () => {
  for (const id of R.CLAUDE_ORCHESTRATION_SKILLS) {
    assert.strictEqual(R.classifySkill(id), "claude-orchestration", id);
  }
  assert.strictEqual(R.classifySkill("dotnet-test"), "claude-tool");
});

test("classifySkill：未知 Skill 回傳 unknown，不預設放行", () => {
  assert.strictEqual(R.classifySkill("some-random-skill"), "unknown");
  assert.strictEqual(R.classifySkill(".claude/skills/some-random-skill/SKILL.md"), "unknown");
});

test("classifySkill：技術識別碼（短名）可對應到共用 Skill", () => {
  assert.strictEqual(R.classifySkill("nsubstitute-mocking"), "shared");
  assert.strictEqual(R.classifySkill("awesome-assertions"), "shared");
  assert.strictEqual(R.normalizeSkillId("awesome-assertions"), "dotnet-testing-awesome-assertions-guide");
  assert.strictEqual(R.normalizeSkillId("aspire-testing"), "dotnet-testing-advanced-aspire-testing");
});

test("canonicalSkillPath：共用 Skill 指向 .agents/skills，Claude 專屬指向 .claude/skills", () => {
  assert.strictEqual(
    R.canonicalSkillPath("dotnet-testing-nsubstitute-mocking"),
    ".agents/skills/dotnet-testing-nsubstitute-mocking/SKILL.md"
  );
  assert.strictEqual(
    R.canonicalSkillPath("dotnet-testing-orchestrator-unit"),
    ".claude/skills/dotnet-testing-orchestrator-unit/SKILL.md"
  );
  assert.strictEqual(R.canonicalSkillPath("dotnet-test"), ".claude/skills/dotnet-test/SKILL.md");
  assert.strictEqual(R.canonicalSkillPath("some-random-skill"), null);
});

test("resolveSkillIdFromPath：兩種前綴、Windows 分隔符、絕對路徑都能取出 Skill ID", () => {
  assert.strictEqual(
    R.resolveSkillIdFromPath(".agents/skills/dotnet-testing-bogus-fake-data/SKILL.md"),
    "dotnet-testing-bogus-fake-data"
  );
  assert.strictEqual(
    R.resolveSkillIdFromPath(".claude\\skills\\dotnet-testing-bogus-fake-data\\SKILL.md"),
    "dotnet-testing-bogus-fake-data"
  );
  assert.strictEqual(
    R.resolveSkillIdFromPath("C:/repo/.agents/skills/dotnet-testing-bogus-fake-data/references/x.md"),
    "dotnet-testing-bogus-fake-data"
  );
  assert.strictEqual(R.resolveSkillIdFromPath("src/Foo.cs"), null);
});

// ------------------------------- 殘留路徑正規化與去重（防禦性，仍保留）

test("canonicalizeSkillPath：殘留的 .claude/skills 共用路徑正規化為 canonical", () => {
  assert.strictEqual(
    R.canonicalizeSkillPath(".claude/skills/dotnet-testing-nsubstitute-mocking/SKILL.md"),
    ".agents/skills/dotnet-testing-nsubstitute-mocking/SKILL.md"
  );
  assert.strictEqual(
    R.canonicalizeSkillPath(".agents/skills/dotnet-testing-bogus-fake-data/references/api.md"),
    ".agents/skills/dotnet-testing-bogus-fake-data/references/api.md"
  );
  // Claude 專屬 Skill 不被改寫
  assert.strictEqual(
    R.canonicalizeSkillPath(".claude/skills/dotnet-test/SKILL.md"),
    ".claude/skills/dotnet-test/SKILL.md"
  );
  assert.strictEqual(R.canonicalizeSkillPath("src\\Foo.cs"), "src/Foo.cs");
});

test("dedupeSkillPaths：殘留路徑與 canonical 路徑不重複計算", () => {
  const out = R.dedupeSkillPaths([
    ".claude/skills/dotnet-testing-nsubstitute-mocking/SKILL.md",
    ".agents/skills/dotnet-testing-nsubstitute-mocking/SKILL.md",
    ".claude/skills/dotnet-test/SKILL.md",
    "tests/FooTests.cs",
  ]);
  assert.deepStrictEqual(out, [
    ".agents/skills/dotnet-testing-nsubstitute-mocking/SKILL.md",
    ".claude/skills/dotnet-test/SKILL.md",
    "tests/FooTests.cs",
  ]);
});

// -------------------------------------------------------------- read-scope

test("read-scope：Orchestrator 不得載入任何技術型 Skill（不論路徑）", () => {
  for (const role of R.CLAUDE_ORCHESTRATION_SKILLS) {
    assert.strictEqual(R.isSkillReadAllowed(role, "dotnet-testing-nsubstitute-mocking").allowed, false, role);
    assert.strictEqual(
      R.isSkillReadAllowed(role, ".agents/skills/dotnet-testing-nsubstitute-mocking/SKILL.md").allowed,
      false,
      role
    );
  }
});

test("read-scope：Orchestrator 不得讀取其他 orchestration Skill", () => {
  assert.strictEqual(
    R.isSkillReadAllowed("dotnet-testing-orchestrator-unit", "dotnet-testing-orchestrator-aspire").allowed,
    false
  );
  assert.strictEqual(
    R.isSkillReadAllowed("dotnet-testing-orchestrator-unit", "dotnet-testing-orchestrator-unit").allowed,
    true
  );
});

test("read-scope：Writer 依 requiredSkills 允許實作 Skills，但不得越界", () => {
  assert.strictEqual(R.isSkillReadAllowed("dotnet-testing-writer", "nsubstitute-mocking").allowed, true);
  assert.strictEqual(
    R.isSkillReadAllowed("dotnet-testing-writer", ".agents/skills/dotnet-testing-nsubstitute-mocking/SKILL.md").allowed,
    true
  );
  assert.strictEqual(
    R.isSkillReadAllowed("dotnet-testing-writer", "dotnet-testing-advanced-aspire-testing").allowed,
    false
  );
  assert.strictEqual(R.isSkillReadAllowed("dotnet-testing-writer", "dotnet-testing-orchestrator-unit").allowed, false);
});

test("read-scope：Reviewer 只能載入審查所需 Skills", () => {
  assert.strictEqual(R.isSkillReadAllowed("dotnet-testing-reviewer", "test-naming-conventions").allowed, true);
  assert.strictEqual(R.isSkillReadAllowed("dotnet-testing-reviewer", "xunit-project-setup").allowed, false);
});

test("read-scope：Unit Executor 只能載入 dotnet-test", () => {
  assert.strictEqual(R.isSkillReadAllowed("dotnet-testing-executor", "dotnet-test").allowed, true);
  assert.strictEqual(R.isSkillReadAllowed("dotnet-testing-executor", "nsubstitute-mocking").allowed, false);
});

test("read-scope：其餘 Executor 不載入任何 Skill", () => {
  for (const role of [
    "dotnet-testing-advanced-integration-executor",
    "dotnet-testing-advanced-aspire-executor",
    "dotnet-testing-advanced-tunit-executor",
  ]) {
    assert.strictEqual(R.isSkillReadAllowed(role, "dotnet-test").allowed, false, role);
    assert.strictEqual(R.isSkillReadAllowed(role, "nsubstitute-mocking").allowed, false, role);
  }
});

test("read-scope：Analyzer 不載入技術型 Skill", () => {
  for (const role of [
    "dotnet-testing-analyzer",
    "dotnet-testing-advanced-integration-analyzer",
    "dotnet-testing-advanced-aspire-analyzer",
    "dotnet-testing-advanced-tunit-analyzer",
  ]) {
    assert.strictEqual(R.isSkillReadAllowed(role, "unit-test-fundamentals").allowed, false, role);
  }
});

test("read-scope：每個 agent 定義檔都有對應的角色註冊", () => {
  const agentsDir = path.join(REPO_ROOT, ".claude", "agents");
  const roles = fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
  for (const role of roles) {
    assert.ok(R.readScopeFor(role), `缺少 read-scope 註冊：${role}`);
  }
});

// ------------------------------------------------------- doctor（合成 fixture）

// 正確佈局：共用 Skill 只在 .agents/skills；Claude 專屬只在 .claude/skills。
function buildFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "skills_doctor_"));
  for (const id of R.SHARED_SKILLS) {
    const dir = path.join(root, ".agents", "skills", id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${id}\n---\n`);
  }
  for (const id of R.CLAUDE_ORCHESTRATION_SKILLS.concat(R.CLAUDE_TOOL_SKILLS)) {
    const dir = path.join(root, ".claude", "skills", id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${id}\n---\n`);
  }
  fs.mkdirSync(path.join(root, ".claude", "agents"), { recursive: true });
  fs.writeFileSync(path.join(root, ".claude", "agents", "dummy.md"), "# dummy\n");
  return root;
}

function codes(list) {
  return list.map((x) => x.code);
}

test("doctor：正確佈局（共用只在 .agents/skills）零錯誤", () => {
  const root = buildFixture();
  const r = doctor.diagnose(root);
  assert.deepStrictEqual(r.errors, [], JSON.stringify(r.errors, null, 2));
  assert.strictEqual(
    r.info.filter((x) => x.code === "SHARED_SKILL_CANONICAL_ONLY").length,
    R.SHARED_SKILLS.length
  );
  fs.rmSync(root, { recursive: true, force: true });
});

test("doctor：共用 Skill 出現在 .claude/skills（實體目錄）視為重複來源", () => {
  const root = buildFixture();
  const stray = path.join(root, ".claude", "skills", "dotnet-testing-nsubstitute-mocking");
  fs.mkdirSync(stray, { recursive: true });
  fs.writeFileSync(path.join(stray, "SKILL.md"), "dup\n");
  const r = doctor.diagnose(root);
  const hit = r.errors.filter((e) => e.code === "SHARED_SKILL_IN_CLAUDE_ROOT");
  assert.strictEqual(hit.length, 1);
  assert.ok(hit[0].fix, "應附移除指令");
  fs.rmSync(root, { recursive: true, force: true });
});

test("doctor：外部共用 Skill 缺席不報 error（僅 info），且不因缺席影響整體通過", () => {
  const root = buildFixture(); // fixture 不建立 unit-test-scenarios
  const r = doctor.diagnose(root);
  assert.deepStrictEqual(r.errors, [], JSON.stringify(r.errors));
  assert.ok(codes(r.info).includes("EXTERNAL_SHARED_SKILL_ABSENT"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("doctor：外部共用 Skill 若存在於 .agents/skills 標記為已安裝（info）", () => {
  const root = buildFixture();
  const dir = path.join(root, ".agents", "skills", "unit-test-scenarios");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), "---\nname: unit-test-scenarios\n---\n");
  const r = doctor.diagnose(root);
  assert.deepStrictEqual(r.errors, []);
  assert.ok(codes(r.info).includes("EXTERNAL_SHARED_SKILL_PRESENT"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("doctor：外部共用 Skill 誤放 .claude/skills 仍報錯", () => {
  const root = buildFixture();
  const stray = path.join(root, ".claude", "skills", "unit-test-scenarios");
  fs.mkdirSync(stray, { recursive: true });
  fs.writeFileSync(path.join(stray, "SKILL.md"), "x\n");
  const r = doctor.diagnose(root);
  assert.ok(codes(r.errors).includes("SHARED_SKILL_IN_CLAUDE_ROOT"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("doctor：共用 Skill 出現在 .claude/skills（symlink）也視為重複來源", () => {
  const root = buildFixture();
  const target = path.join(root, ".agents", "skills", "dotnet-testing-autofixture-basics");
  const link = path.join(root, ".claude", "skills", "dotnet-testing-autofixture-basics");
  try {
    fs.symlinkSync(target, link, "junction");
  } catch {
    fs.symlinkSync(target, link, "dir");
  }
  const r = doctor.diagnose(root);
  assert.ok(codes(r.errors).includes("SHARED_SKILL_IN_CLAUDE_ROOT"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("doctor：canonical 來源缺失時回報錯誤", () => {
  const root = buildFixture();
  fs.rmSync(path.join(root, ".agents", "skills", "dotnet-testing-nsubstitute-mocking"), {
    recursive: true,
    force: true,
  });
  const r = doctor.diagnose(root);
  assert.ok(codes(r.errors).includes("SHARED_CANONICAL_MISSING"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("doctor：orchestration Skill 被誤搬到 .agents/skills 時回報錯誤", () => {
  const root = buildFixture();
  const wrong = path.join(root, ".agents", "skills", "dotnet-testing-orchestrator-unit");
  fs.mkdirSync(wrong, { recursive: true });
  fs.writeFileSync(path.join(wrong, "SKILL.md"), "x\n");
  const r = doctor.diagnose(root);
  assert.ok(codes(r.errors).includes("CLAUDE_SKILL_IN_SHARED_ROOT"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("doctor：agent 定義引用共用 Skill 的 .claude/skills 路徑時回報錯誤", () => {
  const root = buildFixture();
  fs.writeFileSync(
    path.join(root, ".claude", "agents", "dummy.md"),
    "載入 `.claude/skills/dotnet-testing-nsubstitute-mocking/SKILL.md`\n"
  );
  const r = doctor.diagnose(root);
  assert.ok(codes(r.errors).includes("HARDCODED_SHARED_SKILL_PATH"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("doctor：agent 定義引用共用 Skill 的 .agents/skills 路徑不算錯誤", () => {
  const root = buildFixture();
  fs.writeFileSync(
    path.join(root, ".claude", "agents", "dummy.md"),
    "載入 `.agents/skills/dotnet-testing-nsubstitute-mocking/SKILL.md`\n"
  );
  const r = doctor.diagnose(root);
  assert.ok(!codes(r.errors).includes("HARDCODED_SHARED_SKILL_PATH"));
  fs.rmSync(root, { recursive: true, force: true });
});

test("doctor：dotnet-test 的 .claude/skills 路徑不算硬編碼錯誤", () => {
  const root = buildFixture();
  fs.writeFileSync(path.join(root, ".claude", "agents", "dummy.md"), "讀取 `.claude/skills/dotnet-test/SKILL.md`\n");
  const r = doctor.diagnose(root);
  assert.ok(!codes(r.errors).includes("HARDCODED_SHARED_SKILL_PATH"));
  fs.rmSync(root, { recursive: true, force: true });
});

// --------------------------------------------------------- 真實 repo 佈局

test("真實 repo：所有共用 Skill 的 canonical 來源存在於 .agents/skills", () => {
  for (const id of R.SHARED_SKILLS) {
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, ".agents", "skills", id, "SKILL.md")),
      `缺少 .agents/skills/${id}/SKILL.md`
    );
  }
});

test("真實 repo：共用 Skill 不出現在 .claude/skills", () => {
  for (const id of R.SHARED_SKILLS) {
    assert.ok(
      !fs.existsSync(path.join(REPO_ROOT, ".claude", "skills", id)),
      `${id} 不應出現在 .claude/skills（canonical 在 .agents/skills）`
    );
  }
});

test("真實 repo：Claude 專屬 Skill 仍在 .claude/skills，且未出現在 .agents/skills", () => {
  for (const id of R.CLAUDE_ORCHESTRATION_SKILLS.concat(R.CLAUDE_TOOL_SKILLS)) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, ".claude", "skills", id, "SKILL.md")), id);
    assert.ok(!fs.existsSync(path.join(REPO_ROOT, ".agents", "skills", id)), `${id} 不應出現在 .agents/skills`);
  }
});

test("真實 repo：doctor 對整個 repo 零錯誤", () => {
  const r = doctor.diagnose(REPO_ROOT);
  assert.deepStrictEqual(r.errors, [], r.errors.map((e) => `${e.code}: ${e.message}`).join("\n"));
});

// ------------------------------------------------------------------ 結果

if (failures.length > 0) {
  for (const f of failures) {
    console.error(`FAIL: ${f.name}`);
    console.error(`      ${f.err && f.err.message}`);
  }
  console.error(`\n${passed} passed, ${failures.length} failed`);
  process.exit(1);
}
console.log(`${passed} passed, 0 failed`);
