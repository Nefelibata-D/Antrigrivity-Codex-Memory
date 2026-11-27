#!/usr/bin/env node
/**
 * Sync Antigrivity Memory workspace sources to C:\Users\dzc\.gemini\config\
 * and rebuild the memory-dashboard MCP App HTML bundle.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GEMINI_CFG = path.join(os.homedir(), '.gemini', 'config');
const PLUGIN_DST = path.join(GEMINI_CFG, 'plugins', 'memory-dashboard');

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`Synced: ${path.relative(__dirname, src)} -> ${dst}`);
}

const files = [
  ['plugin/package.json', path.join(PLUGIN_DST, 'package.json')],
  ['plugin/plugin.json', path.join(PLUGIN_DST, 'plugin.json')],
  ['plugin/mcp_config.json', path.join(PLUGIN_DST, 'mcp_config.json')],
  ['plugin/server.mjs', path.join(PLUGIN_DST, 'server.mjs')],
  ['plugin/build.mjs', path.join(PLUGIN_DST, 'build.mjs')],
  ['plugin/src/app.js', path.join(PLUGIN_DST, 'src', 'app.js')],
  ['scripts/memory-engine.mjs', path.join(GEMINI_CFG, 'scripts', 'memory-engine.mjs')],
  ['skills/codex-memory-pipeline/SKILL.md', path.join(GEMINI_CFG, 'skills', 'codex-memory-pipeline', 'SKILL.md')],
  ['rules/supermemory.md', path.join(GEMINI_CFG, 'rules', 'supermemory.md')],
];

for (const [rel, dst] of files) {
  const src = path.join(__dirname, rel);
  if (fs.existsSync(src)) copyFile(src, dst);
}

console.log('\nBuilding memory-dashboard bundle...');
execSync('node build.mjs', { cwd: PLUGIN_DST, stdio: 'inherit' });
console.log('Done! Click "热重载" in the Memory panel to load the updated UI.');
