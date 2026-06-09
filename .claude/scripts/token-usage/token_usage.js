#!/usr/bin/env node
// -*- coding: utf-8 -*-
//
// token_usage.js — 測試工作流程 Token 用量統計（整合進 Orchestrator，非 hook、非 skill）
//
// 由 Orchestrator 在自己的工作流程中呼叫，量測「單次測試工作流程執行」的 token 用量，
// 涵蓋 Orchestrator 主執行緒 ＋ 全部 dotnet-testing-* subagent，input 分為
// 純 input / cache 寫入 / cache 讀取，並提供「含快取 input 合計」。
//
// 子指令：
//   start [framework]   工作流程開始時呼叫：自我定位當前 session，寫入 run 起點 marker。
//   report [framework]  工作流程結束時呼叫：計算本次 run 用量，寫報告 + ledger，
//                       並把精簡 Markdown 表格印到 stdout 供 Orchestrator 直接嵌入結果。
//   selftest            以合成 transcript 驗證加總邏輯。
//
// 設計鐵則：
//   * 對 transcript 只讀不寫。
//   * 任何錯誤靜默結束（exit 0），不阻斷 bypassPermissions 自動流程。
//   * 不裝 session 級 hook；input 三分項分開；不寫死 token 單價；不壓縮內容。
//
// 由 Python 版 token_usage.py 1:1 移植；採 CommonJS、零依賴（fs/path/os/crypto）。
// Node 主控台預設 UTF-8 輸出，無需 Python 版的 cp950 reconfigure。

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const SCHEMA_VERSION = 2;
const SUBAGENT_PREFIX = "dotnet-testing-"; // 只計 orchestrator 的 subagent，排除 Explore / general-purpose
const CLEANUP_MARKERS = ["cleanup", "清理"]; // 描述含這些字的 subagent 視為清理任務，不計入用量
const ROLE_ORDER = ["orchestrator", "analyzer", "writer", "executor", "reviewer"];
const CLUSTER_GAP_SECONDS = 1800; // 無 marker 時，以此間隔切出「最近一次工作流程」的 subagent 群

// ---------------------------------------------------------------------------
// 時間解析與格式化
// ---------------------------------------------------------------------------

// 對齊 Python parse_ts：支援 ISO8601（含 Z / 毫秒）；無時區資訊者一律視為 UTC；失敗回 null。
function parseTs(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  let s = String(value).trim();
  if (!s) return null;
  const hasTz = /[zZ]$/.test(s) || /[+-]\d{2}:?\d{2}$/.test(s);
  if (!hasTz) s += "Z"; // 無 Z/offset → 當 UTC（與 Python 一致）
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// Date → 緊湊 UTC 字串 YYYYMMDDTHHMMSSZ（對齊 Python strftime("%Y%m%dT%H%M%SZ")）。
function compactUtc(d) {
  return d.toISOString().replace(/\.\d+Z$/, "Z").replace(/[-:]/g, "");
}

// Date → 報告檔名用 YYYYMMDD-HHMMSS（當地時間，對齊 Python e_dt.strftime）。
function fileStamp(d) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds())
  );
}

// ---------------------------------------------------------------------------
// 路徑編碼
// ---------------------------------------------------------------------------

// 模擬 Claude Code 的專案路徑編碼：: \ / 皆換成 -。
function encodeProjectPath(p) {
  return String(p).replace(/[:\\/]/g, "-");
}

// ---------------------------------------------------------------------------
// 數字格式化（確定性千分位，不用 toLocaleString 以免 locale 差異）
// ---------------------------------------------------------------------------

function addCommas(n) {
  return Math.trunc(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ---------------------------------------------------------------------------
// run id
// ---------------------------------------------------------------------------

function newRunId(framework, start) {
  const hex6 = crypto.randomUUID().replace(/-/g, "").slice(0, 6); // 對應 Python uuid4().hex[:6]
  return `${framework || "run"}-${compactUtc(start)}-${hex6}`;
}

// ---------------------------------------------------------------------------
// 用量累加器
// ---------------------------------------------------------------------------

function toInt(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

class Bucket {
  constructor() {
    this.pure_input = 0;
    this.cache_write = 0;
    this.cache_read = 0;
    this.output = 0;
    this.rows = 0;
    this.count = 0;
  }

  addUsage(u) {
    this.pure_input += toInt(u.input_tokens);
    this.cache_write += toInt(u.cache_creation_input_tokens);
    this.cache_read += toInt(u.cache_read_input_tokens);
    this.output += toInt(u.output_tokens);
    this.rows += 1;
  }

  get input_with_cache() {
    return this.pure_input + this.cache_write + this.cache_read;
  }

  asDict() {
    return {
      pure_input: this.pure_input,
      cache_write: this.cache_write,
      cache_read: this.cache_read,
      input_with_cache: this.input_with_cache,
      output: this.output,
      rows: this.rows,
      count: this.count,
    };
  }
}

function merge(dst, src) {
  dst.pure_input += src.pure_input;
  dst.cache_write += src.cache_write;
  dst.cache_read += src.cache_read;
  dst.output += src.output;
  dst.rows += src.rows;
}

// ---------------------------------------------------------------------------
// 掃描與加總
// ---------------------------------------------------------------------------

// <...>/<sid>.jsonl -> <...>/<sid>/subagents
function subagentsDirFor(transcriptPath) {
  const p = String(transcriptPath);
  const dir = path.dirname(p);
  const base = path.basename(p, path.extname(p)); // 去掉最後一個副檔名（對齊 Python with_suffix("")）
  return path.join(dir, base, "subagents");
}

// 逐行讀含 "usage" 的行並解析（損毀行靜默跳過）。對齊 Python iter_usage_lines。
function iterUsageLines(p) {
  let text;
  try {
    text = fs.readFileSync(p, "utf8");
  } catch (e) {
    return [];
  }
  const out = [];
  for (const line of text.split("\n")) {
    if (line.indexOf('"usage"') === -1) continue;
    try {
      out.push(JSON.parse(line));
    } catch (e) {
      /* skip */
    }
  }
  return out;
}

// 回傳 [lo, hi]（Date 或 null）。對齊 Python file_time_range。
function fileTimeRange(p) {
  let lo = null;
  let hi = null;
  let text;
  try {
    text = fs.readFileSync(p, "utf8");
  } catch (e) {
    return [null, null];
  }
  for (const line of text.split("\n")) {
    if (line.indexOf('"timestamp"') === -1) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (e) {
      continue;
    }
    const ts = parseTs(obj.timestamp);
    if (ts === null) continue;
    if (lo === null || ts.getTime() < lo.getTime()) lo = ts;
    if (hi === null || ts.getTime() > hi.getTime()) hi = ts;
  }
  return [lo, hi];
}

// 回傳 [{metaFile, jsonlFile, agentType, lo, hi}]，僅 dotnet-testing-* 前綴、排除清理任務。
function listWorkflowSubagents(transcriptPath) {
  const out = [];
  const sdir = subagentsDirFor(transcriptPath);
  let names;
  try {
    names = fs.readdirSync(sdir);
  } catch (e) {
    return out;
  }
  names = names.filter((n) => n.endsWith(".meta.json")).sort();
  for (const name of names) {
    const metaFile = path.join(sdir, name);
    let meta;
    try {
      meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
    } catch (e) {
      continue;
    }
    const at = String((meta && meta.agentType) || "");
    if (!at.startsWith(SUBAGENT_PREFIX)) continue;
    // 排除清理任務（Phase 0 前置 / Phase 5 後置都用 Executor 做 cleanup）。
    const desc = String((meta && meta.description) || "").toLowerCase();
    if (CLEANUP_MARKERS.some((mk) => desc.indexOf(mk) !== -1)) continue;
    const jf = path.join(sdir, name.slice(0, -".meta.json".length) + ".jsonl");
    if (!fs.existsSync(jf)) continue;
    const [lo, hi] = fileTimeRange(jf);
    out.push({ metaFile, jsonlFile: jf, agentType: at, lo, hi });
  }
  return out;
}

// 無 marker 時：以 subagent 起始時間做間隔分群，回傳最近一群的最早起始時間。
function latestClusterStart(transcriptPath) {
  const subs = listWorkflowSubagents(transcriptPath).filter((s) => s.lo !== null);
  if (!subs.length) return null;
  subs.sort((a, b) => a.lo.getTime() - b.lo.getTime());
  let clusterStart = subs[subs.length - 1].lo;
  let prev = subs[subs.length - 1].lo;
  for (let i = subs.length - 2; i >= 0; i--) {
    const lo = subs[i].lo;
    if ((prev.getTime() - lo.getTime()) / 1000 <= CLUSTER_GAP_SECONDS) {
      clusterStart = lo;
      prev = lo;
    } else {
      break;
    }
  }
  return clusterStart;
}

function isUsage(u) {
  return u && typeof u === "object" && !Array.isArray(u);
}

// 以時間窗 [start, end]（Date）框定，掃主 transcript + subagents/，回傳 {scopes, models, subagents, total}。
function aggregate(transcriptPath, start, end) {
  const scopes = {};
  const models = {};
  const sb = (n) => scopes[n] || (scopes[n] = new Bucket());
  const mb = (n) => {
    const k = n || "unknown";
    return models[k] || (models[k] = new Bucket());
  };
  const st = start.getTime();
  const en = end.getTime();
  const inWin = (ts) => ts !== null && ts.getTime() >= st && ts.getTime() <= en;

  if (fs.existsSync(transcriptPath)) {
    for (const obj of iterUsageLines(transcriptPath)) {
      if (obj.isSidechain) continue;
      const msg = obj.message || {};
      const u = msg.usage;
      if (!isUsage(u) || !inWin(parseTs(obj.timestamp))) continue;
      sb("orchestrator").addUsage(u);
      mb(msg.model).addUsage(u);
    }
  }

  const subagents = [];
  for (const s of listWorkflowSubagents(transcriptPath)) {
    const { jsonlFile, agentType, lo, hi } = s;
    if (lo !== null && hi !== null && (hi.getTime() < st || lo.getTime() > en)) continue;
    const parts = agentType.split("-");
    const role = parts[parts.length - 1] || "subagent";
    const b = new Bucket();
    for (const obj of iterUsageLines(jsonlFile)) {
      const msg = obj.message || {};
      const u = msg.usage;
      if (!isUsage(u) || !inWin(parseTs(obj.timestamp))) continue;
      b.addUsage(u);
      mb(msg.model).addUsage(u);
    }
    if (b.rows === 0) continue;
    b.count = 1;
    const rb = sb(role);
    merge(rb, b);
    rb.count += 1;
    const d = b.asDict();
    d.agentType = agentType;
    d.role = role;
    d.file = path.basename(jsonlFile);
    subagents.push(d);
  }

  const total = new Bucket();
  for (const k of Object.keys(scopes)) merge(total, scopes[k]);
  return { scopes, models, subagents, total };
}

// ---------------------------------------------------------------------------
// 路徑與環境
// ---------------------------------------------------------------------------

function projectDir() {
  const env = process.env.CLAUDE_PROJECT_DIR;
  if (env) return env;
  let p = __dirname;
  while (true) {
    const c = path.join(p, ".claude");
    try {
      if (fs.statSync(c).isDirectory()) return p;
    } catch (e) {
      /* not here */
    }
    const parent = path.dirname(p);
    if (parent === p) break;
    p = parent;
  }
  return path.resolve(__dirname, "..", "..", ".."); // 後備：token-usage → scripts → .claude → repo
}

let _reportsDirOverride = null; // selftest 用：將報告/ledger 導向暫存目錄
function setReportsDirOverride(p) {
  _reportsDirOverride = p;
}
function reportsDir() {
  if (_reportsDirOverride !== null) return _reportsDirOverride;
  return path.join(projectDir(), "token-usage-reports");
}
function stateDir() {
  return path.join(projectDir(), ".token-usage-state");
}
function nowUtc() {
  return new Date();
}

// ---------------------------------------------------------------------------
// 成本（選用）
// ---------------------------------------------------------------------------

function loadPricing() {
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(path.join(reportsDir(), "pricing.config.json"), "utf8"));
  } catch (e) {
    return null;
  }
  const rates = cfg && typeof cfg === "object" ? cfg.rates : null;
  if (!rates || typeof rates !== "object" || !Object.keys(rates).length) return null;
  for (const v of Object.values(rates)) {
    if (
      v &&
      typeof v === "object" &&
      ["input_per_mtok", "output_per_mtok", "cache_write_per_mtok", "cache_read_per_mtok"].some(
        (k) => (Number(v[k]) || 0) > 0
      )
    ) {
      return rates;
    }
  }
  return null;
}

function round4(x) {
  return Math.round(x * 1e4) / 1e4;
}

function costFor(models, rates) {
  const per = {};
  let total = 0.0;
  for (const [name, b] of Object.entries(models)) {
    const r = rates[name];
    if (!r || typeof r !== "object") continue;
    const c =
      (b.pure_input / 1e6) * (Number(r.input_per_mtok) || 0) +
      (b.cache_write / 1e6) * (Number(r.cache_write_per_mtok) || 0) +
      (b.cache_read / 1e6) * (Number(r.cache_read_per_mtok) || 0) +
      (b.output / 1e6) * (Number(r.output_per_mtok) || 0);
    per[name] = round4(c);
    total += c;
  }
  return [per, round4(total)];
}

// ---------------------------------------------------------------------------
// 輸出（呈現）
// ---------------------------------------------------------------------------

const SCOPE_LABEL = {
  orchestrator: "Orchestrator（主執行緒）",
  analyzer: "Analyzer",
  writer: "Writer",
  executor: "Executor",
  reviewer: "Reviewer",
};

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}
function scopeLabel(r) {
  return SCOPE_LABEL[r] || capitalize(r);
}
function orderedScopes(scopes) {
  const inOrder = ROLE_ORDER.filter((r) => r in scopes);
  const rest = Object.keys(scopes).filter((r) => ROLE_ORDER.indexOf(r) === -1);
  return inOrder.concat(rest);
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
function fmtLocal(d) {
  return (
    d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()) +
    " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds())
  );
}
function fmtUtc(d) {
  return (
    d.getUTCFullYear() + "-" + pad2(d.getUTCMonth() + 1) + "-" + pad2(d.getUTCDate()) +
    " " + pad2(d.getUTCHours()) + ":" + pad2(d.getUTCMinutes()) + ":" + pad2(d.getUTCSeconds()) + "Z"
  );
}

function renderCompactTable(meta, result) {
  const scopes = result.scopes;
  const total = result.total;
  const L = [];
  L.push("### 📊 本次測試工作流程 Token 用量");
  L.push("");
  L.push("| 範圍 | 純input | cache寫入 | cache讀取 | 含快取input | output |");
  L.push("| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const r of orderedScopes(scopes)) {
    const b = scopes[r];
    const sfx = r !== "orchestrator" && b.count > 1 ? "×" + b.count : "";
    L.push(
      "| " + scopeLabel(r) + sfx + " | " + addCommas(b.pure_input) + " | " + addCommas(b.cache_write) +
      " | " + addCommas(b.cache_read) + " | " + addCommas(b.input_with_cache) + " | " + addCommas(b.output) + " |"
    );
  }
  L.push(
    "| **總計** | **" + addCommas(total.pure_input) + "** | **" + addCommas(total.cache_write) +
    "** | **" + addCommas(total.cache_read) + "** | **" + addCommas(total.input_with_cache) +
    "** | **" + addCommas(total.output) + "** |"
  );
  L.push("");
  const rates = loadPricing();
  if (rates) {
    const [, tot] = costFor(result.models, rates);
    L.push("> 估算成本：約 USD " + tot.toFixed(4) + "（單價取自 pricing.config.json）");
  }
  L.push("> 純input=未快取新進；含快取input=純input+cache寫入+cache讀取；cache讀取為累積讀取量（與 ccusage 同口徑）。");
  return L.join("\n");
}

function renderReportMd(meta, result) {
  const total = result.total;
  const scopes = result.scopes;
  const models = result.models;
  const subagents = result.subagents;
  const sDt = parseTs(meta.start_ts);
  const eDt = parseTs(meta.end_ts);
  const la = (dt) => (dt === null ? "（不明）" : fmtLocal(dt) + "（當地） / " + fmtUtc(dt) + "（UTC）");

  const L = [
    "# 測試工作流程 Token 用量報告", "", "## 中繼資料", "",
    "| 欄位 | 內容 |", "| --- | --- |",
    "| run_id | `" + (meta.run_id || "") + "` |",
    "| session_id | `" + (meta.session_id || "") + "` |",
    "| 框架 | " + (meta.framework || "（未判定）") + " |",
    "| 框定方式 | " + (meta.framing || "marker") + " |",
    "| 開始時間 | " + la(sDt) + " |",
    "| 結束時間 | " + la(eDt) + " |",
    "| 執行平台 | " + (meta.host_platform || process.platform) + " |",
    "| subagent 數 | " + subagents.length + " |", "",
    "## 總覽（input 明確分項）", "", "| 項目 | Token |", "| --- | ---: |",
    "| 純 input（未快取） | " + addCommas(total.pure_input) + " |",
    "| cache 寫入 | " + addCommas(total.cache_write) + " |",
    "| cache 讀取 | " + addCommas(total.cache_read) + " |",
    "| **含快取 input 合計** | **" + addCommas(total.input_with_cache) + "** |",
    "| output | " + addCommas(total.output) + " |", "",
    "## 分項 by scope（角色）", "",
    "| scope | 次數 | 純input | cache寫入 | cache讀取 | 含快取input | output |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const r of orderedScopes(scopes)) {
    const b = scopes[r];
    const cnt = r !== "orchestrator" ? b.count : 1;
    const sfx = r !== "orchestrator" && b.count > 1 ? "×" + b.count : "";
    L.push(
      "| " + scopeLabel(r) + sfx + " | " + cnt + " | " + addCommas(b.pure_input) + " | " +
      addCommas(b.cache_write) + " | " + addCommas(b.cache_read) + " | " + addCommas(b.input_with_cache) +
      " | " + addCommas(b.output) + " |"
    );
  }
  L.push("", "## 分項 by 模型", "",
    "| 模型 | 純input | cache寫入 | cache讀取 | 含快取input | output |",
    "| --- | ---: | ---: | ---: | ---: | ---: |");
  for (const name of Object.keys(models).sort()) {
    const b = models[name];
    L.push(
      "| " + name + " | " + addCommas(b.pure_input) + " | " + addCommas(b.cache_write) + " | " +
      addCommas(b.cache_read) + " | " + addCommas(b.input_with_cache) + " | " + addCommas(b.output) + " |"
    );
  }
  L.push("", "## 成本估算（選用）", "");
  const rates = loadPricing();
  if (rates) {
    const [per, tot] = costFor(models, rates);
    L.push("| 模型 | 估算成本 (USD) |", "| --- | ---: |");
    for (const name of Object.keys(per).sort()) L.push("| " + name + " | " + per[name].toFixed(4) + " |");
    L.push("| **合計** | **" + tot.toFixed(4) + "** |", "",
      "> 單價取自 `token-usage-reports/pricing.config.json`，以 https://docs.claude.com/en/docs/about-claude/pricing 為準。");
  } else {
    L.push("未設定單價（`token-usage-reports/pricing.config.json` 不存在或為空），略過成本估算。", "",
      "> 如需成本：填入各模型每百萬 token 單價，以 https://docs.claude.com/en/docs/about-claude/pricing 為準。");
  }
  if (subagents.length) {
    L.push("", "## Subagent 明細", "",
      "| 檔案 | agentType | 純input | cache寫入 | cache讀取 | output |",
      "| --- | --- | ---: | ---: | ---: | ---: |");
    for (const s of subagents) {
      L.push(
        "| `" + s.file + "` | " + s.agentType + " | " + addCommas(s.pure_input) + " | " +
        addCommas(s.cache_write) + " | " + addCommas(s.cache_read) + " | " + addCommas(s.output) + " |"
      );
    }
  }
  L.push("", "## 備註", "",
    "- `cache 讀取` 為各回合累積讀取量（與 ccusage 同口徑），非唯一 token 數。",
    "- 涵蓋範圍：主 transcript（Orchestrator）＋ `subagents/` 中 `agentType` 以 " +
      "`dotnet-testing-` 開頭的 subagent；`Explore` / `general-purpose` 不計入。", "");
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// ledger
// ---------------------------------------------------------------------------

function ledgerEntry(meta, result) {
  const bd = (b) => ({
    pure_input: b.pure_input,
    cache_write: b.cache_write,
    cache_read: b.cache_read,
    input_with_cache: b.input_with_cache,
    output: b.output,
    count: b.count,
  });
  const total = result.total;
  const rates = loadPricing();
  let cost = null;
  if (rates) {
    const [per, tot] = costFor(result.models, rates);
    cost = { by_model: per, total_usd: tot };
  }
  const scopesOut = {};
  for (const [r, b] of Object.entries(result.scopes)) scopesOut[r] = bd(b);
  const modelsOut = {};
  for (const [m, b] of Object.entries(result.models)) modelsOut[m] = bd(b);
  return {
    schema_version: SCHEMA_VERSION,
    run_id: meta.run_id != null ? meta.run_id : null,
    session_id: meta.session_id != null ? meta.session_id : null,
    timestamp: meta.end_ts != null ? meta.end_ts : null,
    framework: meta.framework != null ? meta.framework : null,
    framing: meta.framing || "marker",
    window: { start: meta.start_ts != null ? meta.start_ts : null, end: meta.end_ts != null ? meta.end_ts : null },
    host_platform: meta.host_platform || process.platform,
    scopes: scopesOut,
    models: modelsOut,
    totals: {
      pure_input: total.pure_input,
      cache_write: total.cache_write,
      cache_read: total.cache_read,
      input_with_cache: total.input_with_cache,
      output: total.output,
    },
    cost: cost,
  };
}

function upsertLedger(entry) {
  fs.mkdirSync(reportsDir(), { recursive: true });
  const p = path.join(reportsDir(), "ledger.jsonl");
  const rows = [];
  const seen = {};
  if (fs.existsSync(p)) {
    try {
      for (let line of fs.readFileSync(p, "utf8").split("\n")) {
        line = line.trim();
        if (!line) continue;
        let obj;
        try {
          obj = JSON.parse(line);
        } catch (e) {
          continue;
        }
        const rid = obj.run_id;
        if (rid in seen) {
          rows[seen[rid]] = obj;
        } else {
          seen[rid] = rows.length;
          rows.push(obj);
        }
      }
    } catch (e) {
      rows.length = 0;
    }
  }
  const rid = entry.run_id;
  if (rid in seen) {
    rows[seen[rid]] = entry;
  } else {
    rows.push(entry);
  }
  const tmp = path.join(reportsDir(), "ledger.jsonl.tmp");
  fs.writeFileSync(tmp, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  fs.renameSync(tmp, p);
}

function writeReportFiles(meta, result) {
  fs.mkdirSync(reportsDir(), { recursive: true });
  const md = renderReportMd(meta, result);
  const eDt = parseTs(meta.end_ts) || nowUtc();
  const out = path.join(reportsDir(), "run-" + fileStamp(eDt) + "-" + (meta.run_id || "run") + ".md");
  fs.writeFileSync(out, md);
  fs.writeFileSync(path.join(reportsDir(), "latest.md"), md);
  return out;
}

// ---------------------------------------------------------------------------
// 當前 session 自我定位
// ---------------------------------------------------------------------------

function projectsRoot() {
  return path.join(os.homedir(), ".claude", "projects");
}

function encodedSessionDir() {
  const root = projectsRoot();
  const enc = encodeProjectPath(projectDir());
  const d = path.join(root, enc);
  if (fs.existsSync(d)) return d;
  try {
    const low = enc.toLowerCase();
    for (const child of fs.readdirSync(root)) {
      const cp = path.join(root, child);
      try {
        if (fs.statSync(cp).isDirectory() && child.toLowerCase() === low) return cp;
      } catch (e) {
        /* skip */
      }
    }
  } catch (e) {
    /* skip */
  }
  return d; // 可能不存在，呼叫端自行判斷
}

// 回傳 [sessionId, transcriptPath]；取最近被寫入的 <id>.jsonl。失敗回 [null, null]。
function currentSession() {
  const d = encodedSessionDir();
  if (!fs.existsSync(d)) return [null, null];
  let names;
  try {
    names = fs.readdirSync(d);
  } catch (e) {
    return [null, null];
  }
  const jsonls = names.filter((n) => n.endsWith(".jsonl")).map((n) => path.join(d, n));
  if (!jsonls.length) return [null, null];
  let newest = null;
  let newestM = -Infinity;
  for (const f of jsonls) {
    let m;
    try {
      m = fs.statSync(f).mtimeMs;
    } catch (e) {
      continue;
    }
    if (m > newestM) {
      newestM = m;
      newest = f;
    }
  }
  if (!newest) return [null, null];
  return [path.basename(newest, ".jsonl"), newest];
}

// ---------------------------------------------------------------------------
// marker（run 起點）
// ---------------------------------------------------------------------------

function markerPath(sessionId) {
  const safe = String(sessionId || "unknown")
    .split("")
    .map((c) => (/[A-Za-z0-9\-_]/.test(c) ? c : "_"))
    .join("");
  return path.join(stateDir(), safe + ".json");
}

function writeMarker(marker) {
  fs.mkdirSync(stateDir(), { recursive: true });
  fs.writeFileSync(markerPath(marker.session_id), JSON.stringify(marker, null, 2));
}

function readMarker(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(markerPath(sessionId), "utf8"));
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 子指令
// ---------------------------------------------------------------------------

function cmdStart(framework) {
  const [sid, tp] = currentSession();
  if (!sid) return 0;
  const start = nowUtc();
  const marker = {
    run_id: newRunId(framework, start),
    session_id: sid,
    transcript_path: String(tp),
    framework: framework || "",
    start_ts: start.toISOString(),
    framing: "marker",
  };
  writeMarker(marker);
  return 0;
}

function cmdReport(framework) {
  const [sid, tp] = currentSession();
  if (!sid) {
    process.stdout.write("（找不到當前 session transcript，略過 token 統計）\n");
    return 0;
  }
  const marker = readMarker(sid);
  const end = nowUtc();
  let start;
  let framing;
  let runId;
  let fw;
  if (marker && parseTs(marker.start_ts)) {
    start = parseTs(marker.start_ts);
    framing = "marker";
    runId = marker.run_id;
    fw = marker.framework || framework;
  } else {
    start = latestClusterStart(tp);
    framing = "subagent-cluster";
    fw = framework;
    if (start === null) {
      process.stdout.write("（本 session 未偵測到 dotnet-testing-* subagent，無法框定本次工作流程）\n");
      return 0;
    }
    runId = newRunId(fw, start);
  }
  const result = aggregate(tp, start, end);
  const meta = {
    run_id: runId,
    session_id: sid,
    framework: fw,
    framing: framing,
    start_ts: start.toISOString(),
    end_ts: end.toISOString(),
    host_platform: process.platform,
  };
  try {
    writeReportFiles(meta, result);
    upsertLedger(ledgerEntry(meta, result));
  } catch (e) {
    /* 鐵則：寫檔失敗不影響輸出 */
  }
  process.stdout.write(renderCompactTable(meta, result) + "\n");
  return 0;
}

// ---------------------------------------------------------------------------
// selftest（對齊 Python cmd_selftest）
// ---------------------------------------------------------------------------

function cmdSelftest() {
  const fails = [];
  const chk = (name, cond) => {
    process.stdout.write((cond ? "  ✅ " : "  ❌ ") + name + "\n");
    if (!cond) fails.push(name);
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tu_selftest_"));
  const sid = "00000000-0000-0000-0000-000000000000";
  const main = path.join(tmp, sid + ".jsonl");
  const sdir = path.join(tmp, sid, "subagents");
  fs.mkdirSync(sdir, { recursive: true });
  const TS = (mm) => "2026-06-04T10:" + String(mm).padStart(2, "0") + ":00.000Z";
  const row = (ts, u, model, sc) =>
    JSON.stringify({ type: "assistant", isSidechain: !!sc, timestamp: ts, message: { role: "assistant", model: model || "claude-opus-4-8", usage: u } });
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
    fs.writeFileSync(path.join(sdir, name + ".jsonl"), rowsU.map((u, i) => row(TS(7 + i), u, "claude-sonnet-4-6", true)).join("\n") + "\n");
  };
  mk("agent-1", "dotnet-testing-analyzer", [{ input_tokens: 30, cache_creation_input_tokens: 1000, cache_read_input_tokens: 2000, output_tokens: 400 }]);
  mk("agent-2", "dotnet-testing-writer", [{ input_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 500, output_tokens: 700 }]);
  mk("agent-3", "dotnet-testing-writer", [{ input_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 500, output_tokens: 800 }]);
  mk("agent-x", "Explore", [{ input_tokens: 88888, output_tokens: 88888 }]);
  mk("agent-4", "dotnet-testing-reviewer", [{ input_tokens: 7, output_tokens: 9 }]);
  fs.writeFileSync(path.join(sdir, "agent-cleanup.meta.json"), JSON.stringify({ agentType: "dotnet-testing-executor", description: "cleanup" }));
  fs.writeFileSync(path.join(sdir, "agent-cleanup.jsonl"), row("2026-06-04T09:00:00.000Z", { input_tokens: 12345, cache_creation_input_tokens: 5000, cache_read_input_tokens: 5000, output_tokens: 6789 }, "claude-sonnet-4-6", true) + "\n");
  fs.writeFileSync(path.join(sdir, "agent-endcleanup.meta.json"), JSON.stringify({ agentType: "dotnet-testing-executor", description: "清理 orchestrator 暫存目錄" }));
  fs.writeFileSync(path.join(sdir, "agent-endcleanup.jsonl"), row(TS(8), { input_tokens: 7777, cache_creation_input_tokens: 7777, cache_read_input_tokens: 7777, output_tokens: 7777 }, "claude-sonnet-4-6", true) + "\n");

  const start = parseTs("2026-06-04T10:00:00.000Z");
  const end = parseTs("2026-06-04T10:30:00.000Z");
  const res = aggregate(main, start, end);
  const sc = res.scopes;
  const total = res.total;

  process.stdout.write("selftest：\n");
  const o = sc.orchestrator || new Bucket();
  chk("orchestrator pure=110/cW=200/cR=1300/out=55", o.pure_input === 110 && o.cache_write === 200 && o.cache_read === 1300 && o.output === 55);
  chk("窗外行(99999)被排除", o.pure_input === 110);
  const an = sc.analyzer || new Bucket();
  chk("analyzer pure=30/out=400", an.pure_input === 30 && an.output === 400);
  const wr = sc.writer || new Bucket();
  chk("writer 聚合 pure=10/out=1500/count=2", wr.pure_input === 10 && wr.output === 1500 && wr.count === 2);
  const rv = sc.reviewer || new Bucket();
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
  const cs = latestClusterStart(main);
  chk("latest_cluster_start 命中最早 subagent(10:07)，未含 09:00 cleanup", cs && cs.getTime() === parseTs(TS(7)).getTime());
  const meta = { run_id: "selftest", session_id: sid, framework: "unit", framing: "marker", start_ts: start.toISOString(), end_ts: end.toISOString(), host_platform: process.platform };
  try {
    const md = renderReportMd(meta, res);
    const ct = renderCompactTable(meta, res);
    chk("report/compact render 成功且含三分項", md.indexOf("純 input（未快取）") !== -1 && ct.indexOf("含快取input") !== -1);
  } catch (e) {
    chk("render 成功：" + e, false);
  }

  setReportsDirOverride(path.join(tmp, "reports"));
  try {
    upsertLedger(ledgerEntry(Object.assign({}, meta, { run_id: "run-upsert" }), aggregate(main, start, parseTs(TS(11)))));
    upsertLedger(ledgerEntry(Object.assign({}, meta, { run_id: "run-upsert" }), res));
    const ledgerLines = fs.readFileSync(path.join(tmp, "reports", "ledger.jsonl"), "utf8").split("\n").filter((l) => l.trim());
    chk("修改流程累計：ledger 同 run_id 只有 1 筆（upsert）", ledgerLines.length === 1);
    const last = JSON.parse(ledgerLines[0]);
    chk("修改流程累計：ledger 為最新（output=" + total.output + "）", last.totals.output === total.output);
  } catch (e) {
    chk("ledger upsert 測試：" + e, false);
  } finally {
    setReportsDirOverride(null);
  }

  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) {
    /* skip */
  }
  process.stdout.write("\n");
  if (fails.length) {
    process.stdout.write("selftest 失敗 " + fails.length + " 項：" + fails.join(", ") + "\n");
    return 1;
  }
  process.stdout.write("selftest 全數通過 ✅\n");
  return 0;
}

// ---------------------------------------------------------------------------
// 進入點
// ---------------------------------------------------------------------------

function main(argv) {
  if (!argv.length) {
    process.stderr.write("用法: token_usage.js {start|report|selftest} [framework]\n");
    return 0;
  }
  const cmd = argv[0];
  const framework = argv.length > 1 ? argv[1] : "";
  try {
    if (cmd === "start") return cmdStart(framework);
    if (cmd === "report") return cmdReport(framework);
    if (cmd === "selftest") return cmdSelftest();
    process.stderr.write("未知子指令: " + cmd + "\n");
    return 0;
  } catch (e) {
    process.stderr.write("token_usage 例外（已忽略）: " + ((e && e.message) || e) + "\n");
    return 0;
  }
}

// ---------------------------------------------------------------------------
// 匯出（供 token_usage.test.js 與後續階段使用）
// ---------------------------------------------------------------------------

module.exports = {
  SCHEMA_VERSION,
  SUBAGENT_PREFIX,
  CLEANUP_MARKERS,
  ROLE_ORDER,
  CLUSTER_GAP_SECONDS,
  parseTs,
  compactUtc,
  fileStamp,
  encodeProjectPath,
  addCommas,
  newRunId,
  Bucket,
  merge,
  subagentsDirFor,
  iterUsageLines,
  fileTimeRange,
  listWorkflowSubagents,
  latestClusterStart,
  aggregate,
  projectDir,
  reportsDir,
  stateDir,
  nowUtc,
  setReportsDirOverride,
  loadPricing,
  costFor,
  SCOPE_LABEL,
  orderedScopes,
  renderCompactTable,
  renderReportMd,
  ledgerEntry,
  upsertLedger,
  writeReportFiles,
  projectsRoot,
  encodedSessionDir,
  currentSession,
  markerPath,
  writeMarker,
  readMarker,
  cmdStart,
  cmdReport,
  cmdSelftest,
  main,
};

// CLI 進入點
if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
