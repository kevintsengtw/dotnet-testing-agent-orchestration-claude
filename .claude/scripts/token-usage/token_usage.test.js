#!/usr/bin/env node
// -*- coding: utf-8 -*-
//
// token_usage.test.js — token_usage.js 的單元測試（純 Node assert，零依賴）
// 逐階段成長；執行：node token_usage.test.js（全綠才前進下一階段）。

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const T = require("./token_usage.js");

// 共用：建立與 Python selftest 完全相同的合成 fixtures，回傳 { main, sid, tmp }。
function buildFixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tu_test_"));
  const sid = "00000000-0000-0000-0000-000000000000";
  const main = path.join(tmp, sid + ".jsonl");
  const sdir = path.join(tmp, sid, "subagents");
  fs.mkdirSync(sdir, { recursive: true });
  const TS = (mm) => "2026-06-04T10:" + String(mm).padStart(2, "0") + ":00.000Z";
  const row = (ts, u, model, sc) =>
    JSON.stringify({
      type: "assistant",
      isSidechain: !!sc,
      timestamp: ts,
      message: { role: "assistant", model: model || "claude-opus-4-8", usage: u },
    });
  fs.writeFileSync(
    main,
    [
      row(TS(5), { input_tokens: 100, cache_creation_input_tokens: 200, cache_read_input_tokens: 300, output_tokens: 50 }),
      row(TS(6), { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 1000, output_tokens: 5 }),
      row("2026-06-04T09:00:00.000Z", { input_tokens: 99999, output_tokens: 99999 }),
    ].join("\n") + "\n"
  );
  const mk = (name, at, rowsU) => {
    fs.writeFileSync(path.join(sdir, name + ".meta.json"), JSON.stringify({ agentType: at, description: name }));
    const lines = rowsU.map((u, i) => row(TS(7 + i), u, "claude-sonnet-4-6", true));
    fs.writeFileSync(path.join(sdir, name + ".jsonl"), lines.join("\n") + "\n");
  };
  mk("agent-1", "dotnet-testing-analyzer", [{ input_tokens: 30, cache_creation_input_tokens: 1000, cache_read_input_tokens: 2000, output_tokens: 400 }]);
  mk("agent-2", "dotnet-testing-writer", [{ input_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 500, output_tokens: 700 }]);
  mk("agent-3", "dotnet-testing-writer", [{ input_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 500, output_tokens: 800 }]);
  mk("agent-x", "Explore", [{ input_tokens: 88888, output_tokens: 88888 }]);
  mk("agent-4", "dotnet-testing-reviewer", [{ input_tokens: 7, output_tokens: 9 }]);
  // Phase 0 cleanup executor：時間早於 window（09:00）
  fs.writeFileSync(path.join(sdir, "agent-cleanup.meta.json"), JSON.stringify({ agentType: "dotnet-testing-executor", description: "cleanup" }));
  fs.writeFileSync(
    path.join(sdir, "agent-cleanup.jsonl"),
    row("2026-06-04T09:00:00.000Z", { input_tokens: 12345, cache_creation_input_tokens: 5000, cache_read_input_tokens: 5000, output_tokens: 6789 }, "claude-sonnet-4-6", true) + "\n"
  );
  // Phase 5 末段 cleanup executor：在 window 內（10:08），但描述含「清理」
  fs.writeFileSync(path.join(sdir, "agent-endcleanup.meta.json"), JSON.stringify({ agentType: "dotnet-testing-executor", description: "清理 orchestrator 暫存目錄" }));
  fs.writeFileSync(
    path.join(sdir, "agent-endcleanup.jsonl"),
    row(TS(8), { input_tokens: 7777, cache_creation_input_tokens: 7777, cache_read_input_tokens: 7777, output_tokens: 7777 }, "claude-sonnet-4-6", true) + "\n"
  );
  return { main, sid, tmp };
}

let fails = 0;
let total = 0;
function chk(name, cond) {
  total += 1;
  process.stdout.write((cond ? "  ✅ " : "  ❌ ") + name + "\n");
  if (!cond) fails += 1;
}
function section(title) {
  process.stdout.write("\n=== " + title + " ===\n");
}

// ---------------------------------------------------------------------------
// Phase 1：純函式
// ---------------------------------------------------------------------------

section("Phase 1: parseTs");
{
  const a = T.parseTs("2026-06-04T09:13:14.099Z");
  chk("Z+毫秒解析正確", a && a.getTime() === Date.UTC(2026, 5, 4, 9, 13, 14, 99));
  const b = T.parseTs("2026-05-29T09:13:14Z");
  chk("Z 無毫秒解析正確", b && b.getTime() === Date.UTC(2026, 4, 29, 9, 13, 14));
  const c = T.parseTs("2026-06-04T08:07:01.532+00:00");
  const cz = T.parseTs("2026-06-04T08:07:01.532Z");
  chk("offset +00:00 等同 Z", c && cz && c.getTime() === cz.getTime());
  const naive = T.parseTs("2026-06-04T10:00:00");
  chk("無時區字串視為 UTC", naive && naive.getTime() === Date.UTC(2026, 5, 4, 10, 0, 0));
  chk("空字串→null", T.parseTs("") === null);
  chk("null→null", T.parseTs(null) === null);
  chk("garbage→null", T.parseTs("not-a-date") === null);
}

section("Phase 1: compactUtc / fileStamp / encodeProjectPath / addCommas");
{
  chk(
    "compactUtc → YYYYMMDDTHHMMSSZ",
    T.compactUtc(new Date("2026-06-04T08:07:01.532Z")) === "20260604T080701Z"
  );
  chk("encodeProjectPath Windows", T.encodeProjectPath("c:\\github\\x") === "c--github-x");
  chk("encodeProjectPath POSIX", T.encodeProjectPath("/Users/k/p") === "-Users-k-p");
  chk("addCommas 1234567", T.addCommas(1234567) === "1,234,567");
  chk("addCommas 524", T.addCommas(524) === "524");
  chk("addCommas 0", T.addCommas(0) === "0");
  chk("addCommas 非數字→0", T.addCommas(undefined) === "0");
}

section("Phase 1: newRunId");
{
  const id = T.newRunId("integration", T.parseTs("2026-06-04T08:07:01.532Z"));
  chk("格式 fw-YYYYMMDDTHHMMSSZ-hex6", /^integration-\d{8}T\d{6}Z-[0-9a-f]{6}$/.test(id));
  const id2 = T.newRunId("", T.parseTs("2026-06-04T08:07:01.532Z"));
  chk("空 framework → run-", /^run-\d{8}T\d{6}Z-[0-9a-f]{6}$/.test(id2));
}

section("Phase 1: Bucket / merge");
{
  const b = new T.Bucket();
  b.addUsage({
    input_tokens: 100,
    cache_creation_input_tokens: 200,
    cache_read_input_tokens: 300,
    output_tokens: 50,
  });
  chk("addUsage 四分項", b.pure_input === 100 && b.cache_write === 200 && b.cache_read === 300 && b.output === 50);
  chk("rows 計數", b.rows === 1);
  chk("input_with_cache = 純+寫+讀", b.input_with_cache === 600);
  b.addUsage({ input_tokens: 7, output_tokens: 9 }); // 缺 cache 欄
  chk("缺 cache 欄位以 0 計", b.cache_write === 200 && b.cache_read === 300 && b.pure_input === 107 && b.output === 59);

  const dst = new T.Bucket();
  const src = new T.Bucket();
  src.addUsage({ input_tokens: 5, cache_creation_input_tokens: 1, cache_read_input_tokens: 2, output_tokens: 3 });
  T.merge(dst, src);
  chk("merge 累加 + rows", dst.pure_input === 5 && dst.cache_write === 1 && dst.cache_read === 2 && dst.output === 3 && dst.rows === 1);

  const d = b.asDict();
  chk("asDict 含 input_with_cache", d.input_with_cache === b.input_with_cache && d.pure_input === 107);
}

// ---------------------------------------------------------------------------
// Phase 2：聚合核心（與 Python selftest 同一組合成資料、同一組斷言）
// ---------------------------------------------------------------------------

section("Phase 2: aggregate");
{
  const fx = buildFixture();
  const start = T.parseTs("2026-06-04T10:00:00.000Z");
  const end = T.parseTs("2026-06-04T10:30:00.000Z");
  const res = T.aggregate(fx.main, start, end);
  const sc = res.scopes;
  const total = res.total;

  const o = sc.orchestrator || new T.Bucket();
  chk("orchestrator pure=110/cW=200/cR=1300/out=55", o.pure_input === 110 && o.cache_write === 200 && o.cache_read === 1300 && o.output === 55);
  chk("窗外行(99999)被排除", o.pure_input === 110);
  const an = sc.analyzer || new T.Bucket();
  chk("analyzer pure=30/out=400", an.pure_input === 30 && an.output === 400);
  const wr = sc.writer || new T.Bucket();
  chk("writer 聚合 pure=10/out=1500/count=2", wr.pure_input === 10 && wr.output === 1500 && wr.count === 2);
  const rv = sc.reviewer || new T.Bucket();
  chk("reviewer 缺cache→0, pure=7/out=9", rv.cache_write === 0 && rv.cache_read === 0 && rv.pure_input === 7 && rv.output === 9);
  chk("Explore 被排除", !("Explore" in sc) && !("explore" in sc));
  chk("Explore 不污染 total", total.pure_input < 88888);
  const expIwc = 110 + 200 + 1300 + (30 + 1000 + 2000) + (10 + 200 + 1000) + (7 + 0 + 0);
  chk("含快取 input 合計=" + expIwc, total.input_with_cache === expIwc);
  chk("total output=" + (55 + 400 + 1500 + 9), total.output === 55 + 400 + 1500 + 9);
  chk("models 不含 Explore 88888", Object.values(res.models).every((b) => b.pure_input < 88888));
  chk("Phase 0 cleanup executor(窗外)被排除（無 executor scope）", !("executor" in sc));
  chk("Phase 5 cleanup executor(窗內,描述含清理)被描述過濾排除", !("executor" in sc));
  chk("cleanup 的 12345/7777 未污染 total", total.pure_input === 110 + 30 + 10 + 7);

  const cs = T.latestClusterStart(fx.main);
  chk("latestClusterStart 命中最早 subagent(10:07)，未含 09:00 cleanup", cs && cs.getTime() === T.parseTs("2026-06-04T10:07:00.000Z").getTime());

  const [lo, hi] = T.fileTimeRange(path.join(fx.tmp, fx.sid, "subagents", "agent-1.jsonl"));
  chk("fileTimeRange 單行範圍", lo && hi && lo.getTime() === T.parseTs("2026-06-04T10:07:00.000Z").getTime() && hi.getTime() === lo.getTime());

  fs.rmSync(fx.tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// Phase 3：呈現 + ledger
// ---------------------------------------------------------------------------

section("Phase 3: render / ledger / writeReportFiles");
{
  const fx = buildFixture();
  const start = T.parseTs("2026-06-04T10:00:00.000Z");
  const end = T.parseTs("2026-06-04T10:30:00.000Z");
  const res = T.aggregate(fx.main, start, end);
  const meta = {
    run_id: "unit-20260604T100000Z-abc123",
    session_id: fx.sid,
    framework: "unit",
    framing: "marker",
    start_ts: "2026-06-04T10:00:00.000Z",
    end_ts: "2026-06-04T10:30:00.000Z",
    host_platform: "win32",
  };

  const ct = T.renderCompactTable(meta, res);
  chk("compact 含標題", ct.indexOf("### 📊 本次測試工作流程 Token 用量") !== -1);
  chk("compact 含三分項表頭", ct.indexOf("純input | cache寫入 | cache讀取 | 含快取input") !== -1);
  chk("compact 含總計 5,857", ct.indexOf("**5,857**") !== -1);
  chk("compact 含 Writer×2", ct.indexOf("Writer×2") !== -1);
  chk("compact 未設單價→無成本行", ct.indexOf("估算成本") === -1);

  const md = T.renderReportMd(meta, res);
  chk("report 含主標題", md.indexOf("# 測試工作流程 Token 用量報告") !== -1);
  chk("report 含 input 三分項", md.indexOf("純 input（未快取）") !== -1 && md.indexOf("cache 寫入") !== -1 && md.indexOf("cache 讀取") !== -1);
  chk("report 含含快取合計 5,857", md.indexOf("**含快取 input 合計** | **5,857**") !== -1);
  chk("report 含 by scope / by 模型", md.indexOf("## 分項 by scope") !== -1 && md.indexOf("## 分項 by 模型") !== -1);
  chk("report 未設單價提示", md.indexOf("未設定單價") !== -1);
  chk("report 含 Subagent 明細與備註", md.indexOf("## Subagent 明細") !== -1 && md.indexOf("## 備註") !== -1);
  chk("report 框定方式=marker", md.indexOf("| 框定方式 | marker |") !== -1);

  const entry = T.ledgerEntry(meta, res);
  chk("ledgerEntry schema_version=2", entry.schema_version === 2);
  chk("ledgerEntry totals.input_with_cache=5857", entry.totals.input_with_cache === 5857);
  chk("ledgerEntry framing/cost", entry.framing === "marker" && entry.cost === null);
  chk("ledgerEntry scopes 含 writer count=2", entry.scopes.writer && entry.scopes.writer.count === 2);

  // upsert 冪等 + writeReportFiles，導向暫存目錄避免污染 repo
  const repTmp = fs.mkdtempSync(path.join(os.tmpdir(), "tu_reports_"));
  T.setReportsDirOverride(repTmp);
  try {
    const countLines = () => fs.readFileSync(path.join(repTmp, "ledger.jsonl"), "utf8").split("\n").filter((l) => l.trim()).length;
    T.upsertLedger(T.ledgerEntry(meta, res));
    chk("upsert 第一次 → 1 行", countLines() === 1);
    T.upsertLedger(T.ledgerEntry(meta, res)); // 同 run_id
    chk("upsert 同 run_id → 仍 1 行", countLines() === 1);
    const meta2 = Object.assign({}, meta, { run_id: "unit-other-xyz789" });
    T.upsertLedger(T.ledgerEntry(meta2, res));
    chk("upsert 不同 run_id → 2 行", countLines() === 2);

    const out = T.writeReportFiles(meta, res);
    chk("writeReportFiles 產出 run-*.md", fs.existsSync(out) && /run-\d{8}-\d{6}-unit-/.test(path.basename(out)));
    chk("writeReportFiles 產出 latest.md", fs.existsSync(path.join(repTmp, "latest.md")));
  } finally {
    T.setReportsDirOverride(null);
    fs.rmSync(repTmp, { recursive: true, force: true });
  }

  fs.rmSync(fx.tmp, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 結果
// ---------------------------------------------------------------------------
process.stdout.write("\n");
if (fails) {
  process.stdout.write(`token_usage.test.js 失敗 ${fails}/${total} 項 ❌\n`);
  process.exit(1);
}
process.stdout.write(`token_usage.test.js 全數通過 ✅（${total} 項）\n`);
process.exit(0);
