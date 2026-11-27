#!/usr/bin/env node
/**
 * Cross-platform (Windows / Linux / macOS) one-click installer for Antigrivity Memory.
 * Usage:
 *   node install.mjs [--force] [--skip-existing] [--skip-npm] [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import readline from 'node:readline';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const SKIP_NPM = args.has('--skip-npm');
const FORCE = args.has('--force') || args.has('-y');
const SKIP_EXISTING = args.has('--skip-existing');

const HOME = os.homedir();
const GEMINI_CFG = path.join(HOME, '.gemini', 'config');
const PLUGIN_DST = path.join(GEMINI_CFG, 'plugins', 'memory-dashboard');
const SCRIPT_DST = path.join(GEMINI_CFG, 'scripts', 'memory-engine.mjs');
const SKILL_DST = path.join(GEMINI_CFG, 'skills', 'codex-memory-pipeline', 'SKILL.md');
const RULE_DST = path.join(GEMINI_CFG, 'rules', 'supermemory.md');
const HOOKS_FILE = path.join(GEMINI_CFG, 'hooks.json');
const MEMORIES_DIR = path.join(GEMINI_CFG, 'memories');
const BRAIN_DIR = path.join(HOME, '.gemini', 'antigravity', 'brain');
const SIDECAR_FILE = path.join(GEMINI_CFG, 'sidecars', 'nightly-memory-consolidation', 'sidecar.json');

function log(msg) {
  console.log(`[antigrivity-memory] ${msg}`);
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function ensureDir(dir) {
  if (DRY_RUN) {
    log(`[预览] 创建目录: ${dir}`);
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
}

function mergeHooks(overwriteHook) {
  let hooks = {};
  if (fs.existsSync(HOOKS_FILE)) {
    try {
      hooks = JSON.parse(fs.readFileSync(HOOKS_FILE, 'utf8'));
    } catch {
      log(`警告：${HOOKS_FILE} 不是合法 JSON，已备份为 hooks.json.bak`);
      if (!DRY_RUN) {
        fs.copyFileSync(HOOKS_FILE, `${HOOKS_FILE}.bak`);
      }
      hooks = {};
    }
  }

  if (hooks['antigravity-memory-hooks'] && !overwriteHook) {
    log(`跳过 hooks.json：已存在 antigravity-memory-hooks 配置（未覆盖）`);
    return 'skipped';
  }

  delete hooks['codex-supermemory-hooks'];
  hooks['antigravity-memory-hooks'] = {
    SessionStart: [
      {
        type: 'command',
        command: `node "${SCRIPT_DST}" session-start`,
        timeout: 10,
      },
    ],
    Stop: [
      {
        type: 'command',
        command: `node "${SCRIPT_DST}" enqueue`,
        timeout: 5,
      },
    ],
  };

  if (DRY_RUN) {
    log(`[预览] 更新钩子配置: ${HOOKS_FILE}`);
    return 'updated';
  }
  ensureDir(path.dirname(HOOKS_FILE));
  fs.writeFileSync(HOOKS_FILE, JSON.stringify(hooks, null, 2) + '\n', 'utf8');
  log(`已更新钩子配置: ${HOOKS_FILE}`);
  return 'updated';
}

async function main() {
  log(`系统平台: ${process.platform} | Node 版本: ${process.version}`);
  log(`目标配置目录: ${GEMINI_CFG}`);
  if (DRY_RUN) log('当前为 --dry-run 预览模式，不会实际修改任何文件。');

  const files = [
    ['plugin/package.json', path.join(PLUGIN_DST, 'package.json')],
    ['plugin/plugin.json', path.join(PLUGIN_DST, 'plugin.json')],
    ['plugin/mcp_config.json', path.join(PLUGIN_DST, 'mcp_config.json')],
    ['plugin/server.mjs', path.join(PLUGIN_DST, 'server.mjs')],
    ['plugin/build.mjs', path.join(PLUGIN_DST, 'build.mjs')],
    ['plugin/src/app.js', path.join(PLUGIN_DST, 'src', 'app.js')],
    ['plugin/assets/logo.png', path.join(PLUGIN_DST, 'assets', 'logo.png')],
    ['scripts/memory-engine.mjs', SCRIPT_DST],
    ['skills/codex-memory-pipeline/SKILL.md', SKILL_DST],
    ['rules/supermemory.md', RULE_DST],
  ];

  // Detect existing files before writing
  const existingFiles = files.filter(([, dst]) => fs.existsSync(dst));
  let overwriteExisting = FORCE;

  if (existingFiles.length > 0) {
    log(`检测到 ${existingFiles.length} 个目标文件已存在（例如：${path.basename(existingFiles[0][1])}）。`);
    if (SKIP_EXISTING) {
      overwriteExisting = false;
      log('已指定 --skip-existing：将保留现有文件，仅补充缺失文件。');
    } else if (FORCE) {
      overwriteExisting = true;
      log('已指定 --force：将直接覆盖已有文件。');
    } else if (DRY_RUN || !process.stdin.isTTY) {
      overwriteExisting = false;
      log('非交互环境/预览模式：默认不覆盖已存在文件（如需覆盖请加 --force）。');
    } else {
      const ans = await ask(
        '请选择处理方式：[y] 覆盖更新已有文件 / [s] 跳过已有文件（不覆盖，默认） / [n] 取消安装：'
      );
      if (ans === 'n' || ans === 'no') {
        log('已取消安装。');
        return;
      }
      overwriteExisting = ans === 'y' || ans === 'yes';
      log(overwriteExisting ? '将覆盖更新已有文件。' : '将跳过已有文件，仅安装缺失项。');
    }
  }

  let installedCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;

  for (const [rel, dst] of files) {
    const src = path.join(__dirname, rel);
    if (!fs.existsSync(src)) {
      log(`警告：找不到源文件 ${rel}，已跳过`);
      continue;
    }
    const exists = fs.existsSync(dst);
    if (exists && !overwriteExisting) {
      log(`跳过（已存在）: ${dst}`);
      skippedCount++;
      continue;
    }
    if (DRY_RUN) {
      log(`[预览] ${exists ? '覆盖' : '新增'}: ${rel} -> ${dst}`);
    } else {
      ensureDir(path.dirname(dst));
      fs.copyFileSync(src, dst);
      log(`${exists ? '已更新' : '已新增'}: ${dst}`);
    }
    if (exists) updatedCount++;
    else installedCount++;
  }

  // Initialize memories directory layout (never overwrites user memory data)
  ensureDir(path.join(MEMORIES_DIR, 'global', 'ad_hoc_notes'));
  ensureDir(path.join(MEMORIES_DIR, 'projects'));
  log(`记忆数据目录已就绪（保留现有记忆数据，不会覆盖）: ${MEMORIES_DIR}`);

  // Merge SessionStart & Stop hooks into hooks.json
  mergeHooks(overwriteExisting);

  // Configure nightly Memory Consolidation automation with memories + brain permissions
  const sidecarExists = fs.existsSync(SIDECAR_FILE);
  if (sidecarExists && !overwriteExisting) {
    log(`跳过定时任务配置（已存在）: ${SIDECAR_FILE}`);
  } else {
    const sidecarConfig = {
      builtin: 'schedule',
      args: [
        'CRON_TZ=Asia/Shanghai 30 23 * * *',
        'agentapi',
        'new-conversation',
        '--model=gemini-4-hydrogen-medium',
        '--title=Memory Consolidation',
        '--',
        `[CODEX-MEMORY-CONSOLIDATION] Follow the codex-memory-pipeline skill at ${SKILL_DST} to run the memory consolidation pipeline.`
      ],
      restart_policy: 'always',
      display_name: 'Memory Consolidation',
      description: 'Every night at 23:30 (Asia/Shanghai), runs the offline memory consolidation pipeline.',
      agent_permissions: {
        workspace_uris: [
          pathToFileURL(MEMORIES_DIR).href,
          pathToFileURL(BRAIN_DIR).href
        ],
        access_grants: [
          `command(node ${SCRIPT_DST})`,
          `read_file(${MEMORIES_DIR})`,
          `write_file(${MEMORIES_DIR})`,
          `read_file(${BRAIN_DIR})`,
          `read_file(${path.dirname(SKILL_DST)})`,
          'mcp(supermemory/add_memory)',
          'mcp(supermemory/get_profile)',
          'mcp(supermemory/search_memory)',
          'mcp(supermemory/forget_memory)'
        ]
      }
    };
    if (DRY_RUN) {
      log(`[预览] ${sidecarExists ? '更新' : '创建'}定时任务配置: ${SIDECAR_FILE}`);
    } else {
      ensureDir(path.dirname(SIDECAR_FILE));
      fs.writeFileSync(SIDECAR_FILE, JSON.stringify(sidecarConfig, null, 2) + '\n', 'utf8');
      log(`${sidecarExists ? '已更新' : '已创建'}定时任务配置: ${SIDECAR_FILE}`);
    }
  }

  // Install plugin npm dependencies & build dashboard.html
  if (!DRY_RUN) {
    const hasNodeModules = fs.existsSync(path.join(PLUGIN_DST, 'node_modules'));
    if (!SKIP_NPM && !hasNodeModules) {
      log('正在安装插件依赖 (npm install)...');
      execSync('npm install', { cwd: PLUGIN_DST, stdio: 'inherit' });
    } else if (hasNodeModules) {
      log('检测到插件 node_modules 已存在，跳过 npm install。');
    }
    log('正在构建 memory-dashboard 界面...');
    execSync('node build.mjs', { cwd: PLUGIN_DST, stdio: 'inherit' });
  } else {
    log('[预览] 如缺少 node_modules 将执行 npm install，随后执行 node build.mjs');
  }

  log(`完成！新增 ${installedCount} 个，更新 ${updatedCount} 个，跳过 ${skippedCount} 个。`);
  log('重启 Antigravity 或重新加载插件后，即可在侧边栏使用 Memory 面板。');
}

main().catch((err) => {
  console.error('[antigrivity-memory] 安装失败：', err.message || err);
  process.exit(1);
});
