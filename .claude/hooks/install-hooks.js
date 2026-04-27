#!/usr/bin/env node
/**
 * install-hooks.js
 *
 * 安裝 dotnet-testing Agent Timer Hooks 到目標專案。
 * 複製 hook 腳本並合併 hooks 配置到 .claude/settings.json。
 *
 * 用法：
 *   node /path/to/dotnet-testing-repo/.claude/hooks/install-hooks.js [目標專案路徑]
 *
 *   目標專案路徑預設為當前工作目錄。
 *
 * 範例：
 *   cd /your-project
 *   node /path/to/dotnet-testing-repo/.claude/hooks/install-hooks.js
 *
 *   # 或指定目標路徑
 *   node /path/to/dotnet-testing-repo/.claude/hooks/install-hooks.js /your-project
 */

const fs = require("fs");
const path = require("path");

// --- 定位來源與目標 ---
const SCRIPT_DIR = __dirname;
const TARGET_DIR = path.resolve(process.argv[2] || ".");
const TARGET_HOOKS_DIR = path.join(TARGET_DIR, ".claude", "hooks");
const TARGET_SETTINGS = path.join(TARGET_DIR, ".claude", "settings.json");

// Hook 檔案清單
const HOOK_FILES = [
  "dotnet-testing-agent-timer-pre.sh",
  "dotnet-testing-agent-timer-post.sh",
];

// 要合併的 hooks 配置
const HOOKS_CONFIG = {
  PreToolUse: [
    {
      matcher: "Agent",
      hooks: [
        {
          type: "command",
          command: "bash .claude/hooks/dotnet-testing-agent-timer-pre.sh",
        },
      ],
    },
  ],
  PostToolUse: [
    {
      matcher: "Agent",
      hooks: [
        {
          type: "command",
          command: "bash .claude/hooks/dotnet-testing-agent-timer-post.sh",
        },
      ],
    },
  ],
};

// --- 顏色輸出 ---
const isColorSupported =
  process.stdout.isTTY && process.env.TERM !== "dumb";
const c = {
  blue: (s) => (isColorSupported ? `\x1b[34m${s}\x1b[0m` : s),
  green: (s) => (isColorSupported ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s) => (isColorSupported ? `\x1b[33m${s}\x1b[0m` : s),
};
const info = (msg) => console.log(`${c.blue("[INFO]")} ${msg}`);
const ok = (msg) => console.log(`${c.green("[OK]")} ${msg}`);
const warn = (msg) => console.log(`${c.yellow("[WARN]")} ${msg}`);

// --- Step 1：複製 hook 腳本 ---
function copyHookFiles() {
  info(`Step 1：複製 hook 腳本到 ${TARGET_HOOKS_DIR}/`);
  fs.mkdirSync(TARGET_HOOKS_DIR, { recursive: true });

  for (const hookFile of HOOK_FILES) {
    const src = path.join(SCRIPT_DIR, hookFile);
    const dst = path.join(TARGET_HOOKS_DIR, hookFile);

    if (!fs.existsSync(src)) {
      warn(`來源檔案不存在，跳過：${src}`);
      continue;
    }

    // 冪等：內容相同則跳過
    if (fs.existsSync(dst)) {
      const srcContent = fs.readFileSync(src);
      const dstContent = fs.readFileSync(dst);
      if (srcContent.equals(dstContent)) {
        ok(`已是最新，跳過：${hookFile}`);
        continue;
      }
    }

    fs.copyFileSync(src, dst);
    // Unix 系統設定執行權限
    try {
      fs.chmodSync(dst, 0o755);
    } catch {
      // Windows 不支援 chmod，忽略
    }
    ok(`已複製：${hookFile}`);
  }
}

// --- Step 2：合併 hooks 配置到 settings.json ---
function mergeHooksConfig() {
  info(`Step 2：合併 hooks 配置到 ${TARGET_SETTINGS}`);

  fs.mkdirSync(path.dirname(TARGET_SETTINGS), { recursive: true });

  let settings = {};
  if (fs.existsSync(TARGET_SETTINGS)) {
    try {
      settings = JSON.parse(fs.readFileSync(TARGET_SETTINGS, "utf8"));
    } catch {
      warn("settings.json 解析失敗，將以新內容覆寫 hooks 區段");
      settings = {};
    }
  }

  // 檢查是否已有相同配置（冪等）
  if (
    settings.hooks &&
    JSON.stringify(settings.hooks) === JSON.stringify(HOOKS_CONFIG)
  ) {
    ok("hooks 配置已是最新，跳過");
    return;
  }

  settings.hooks = HOOKS_CONFIG;
  fs.writeFileSync(TARGET_SETTINGS, JSON.stringify(settings, null, 2) + "\n");
  ok("hooks 配置已合併到 settings.json");
}

// --- 主程式 ---
function main() {
  console.log("");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  dotnet-testing Agent Timer Hooks 安裝程式      ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("");
  info(`來源目錄：${SCRIPT_DIR}`);
  info(`目標專案：${TARGET_DIR}`);
  console.log("");

  copyHookFiles();
  console.log("");
  mergeHooksConfig();

  console.log("");
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  安裝完成！                                     ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log("");
  info("已安裝的檔案：");
  for (const hookFile of HOOK_FILES) {
    console.log(`  - .claude/hooks/${hookFile}`);
  }
  console.log("  - .claude/settings.json（hooks 區段）");
  console.log("");
  info("hooks 會在 Agent tool 呼叫 dotnet-testing-* subagent 時");
  info("自動追蹤執行時間並注入到 Claude 的 context 中。");
  console.log("");
}

main();
