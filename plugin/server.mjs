#!/usr/bin/env node
/**
 * Antigravity MCP App Server — Codex v2 + Supermemory Dashboard
 * Exposes `open_memory_dashboard` with global (left sidebar) + aux_pane entrypoints,
 * and app-only data tools (visibility: ["app"]) so they add zero model token overhead.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import readline from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(__dirname, 'dist', 'dashboard.html');
const APP_URI = 'ui://memory/dashboard.html';

const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, '.gemini', 'config');
const MEMORIES_DIR = path.join(CONFIG_DIR, 'memories');
const GLOBAL_DIR = path.join(MEMORIES_DIR, 'global');
const PROJECTS_DIR = path.join(MEMORIES_DIR, 'projects');
const STATE_FILE = path.join(MEMORIES_DIR, 'state.json');
const QUEUE_FILE = path.join(MEMORIES_DIR, 'queue.json');
const LOCK_FILE = path.join(MEMORIES_DIR, 'consolidation.lock');
const CONFIG_FILE = path.join(MEMORIES_DIR, 'config.json');
const MCP_CONFIG_FILE = path.join(CONFIG_DIR, 'mcp_config.json');
const MCP_SCHEMAS_DIR = path.join(HOME, '.gemini', 'antigravity', 'mcp', 'supermemory');

const CONSOLIDATION_MARKER = '[CODEX-MEMORY-CONSOLIDATION]';
const DEFAULT_CONFIG = {
  supermemory_enabled: true,
  schedule_time: '23:30',
  model: 'gemini-4-hydrogen-medium',
  max_inject_bytes: 8900,
  global_ratio: 33
};
const LOCK_TTL_MS = 30 * 60 * 1000;

function loadConfig() {
  const raw = readJsonSafe(CONFIG_FILE, {});
  const max_inject_bytes = Number.isFinite(Number(raw.max_inject_bytes))
    ? Math.max(3000, Math.min(32000, Math.round(Number(raw.max_inject_bytes))))
    : DEFAULT_CONFIG.max_inject_bytes;
  const global_ratio = Number.isFinite(Number(raw.global_ratio))
    ? Math.max(10, Math.min(80, Math.round(Number(raw.global_ratio))))
    : DEFAULT_CONFIG.global_ratio;
  const global_budget = Math.round(max_inject_bytes * (global_ratio / 100));
  const project_budget = Math.max(1000, max_inject_bytes - global_budget);
  return {
    supermemory_enabled: typeof raw.supermemory_enabled === 'boolean' ? raw.supermemory_enabled : DEFAULT_CONFIG.supermemory_enabled,
    schedule_time: typeof raw.schedule_time === 'string' && /^\d{2}:\d{2}$/.test(raw.schedule_time) ? raw.schedule_time : DEFAULT_CONFIG.schedule_time,
    model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : DEFAULT_CONFIG.model,
    max_inject_bytes,
    global_ratio,
    global_budget,
    project_budget
  };
}

function saveConfig(patch = {}) {
  const cur = loadConfig();
  const next = {
    supermemory_enabled: typeof patch.supermemory_enabled === 'boolean' ? patch.supermemory_enabled : cur.supermemory_enabled,
    schedule_time: typeof patch.schedule_time === 'string' && /^\d{2}:\d{2}$/.test(patch.schedule_time) ? patch.schedule_time : cur.schedule_time,
    model: typeof patch.model === 'string' && patch.model.trim() ? patch.model.trim() : cur.model,
    max_inject_bytes: Number.isFinite(Number(patch.max_inject_bytes))
      ? Math.max(3000, Math.min(32000, Math.round(Number(patch.max_inject_bytes))))
      : cur.max_inject_bytes,
    global_ratio: Number.isFinite(Number(patch.global_ratio))
      ? Math.max(10, Math.min(80, Math.round(Number(patch.global_ratio))))
      : cur.global_ratio
  };
  writeJsonAtomic(CONFIG_FILE, next);
  return loadConfig();
}

function detectSupermemoryMcp() {
  const mcpCfg = readJsonSafe(MCP_CONFIG_FILE, {});
  const servers = mcpCfg.mcpServers || {};
  const entry = servers.supermemory || servers['supermemory-mcp'] || null;
  const configured = Boolean(entry);
  const schemaCount = fs.existsSync(MCP_SCHEMAS_DIR)
    ? fs.readdirSync(MCP_SCHEMAS_DIR).filter((f) => f.endsWith('.json')).length
    : 0;
  const transport = entry?.serverUrl || entry?.url
    ? 'remote'
    : entry?.command
      ? 'stdio'
      : 'unknown';
  const endpoint = entry?.serverUrl || entry?.url || entry?.command || '';
  return {
    configured,
    connected: configured && schemaCount > 0,
    schema_count: schemaCount,
    transport,
    endpoint,
    config_path: MCP_CONFIG_FILE
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readTextSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function writeJsonAtomic(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function isSafeSegment(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9._-]+$/.test(name) && !name.includes('..');
}

function getScopeDir(scope) {
  if (scope === 'global') return GLOBAL_DIR;
  if (!isSafeSegment(scope)) throw new Error('Invalid scope name');
  return path.join(PROJECTS_DIR, scope);
}

function listScopes() {
  const scopes = ['global'];
  if (fs.existsSync(PROJECTS_DIR)) {
    for (const ent of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
      if (ent.isDirectory() && isSafeSegment(ent.name)) {
        scopes.push(ent.name);
      }
    }
  }
  return scopes;
}

function getLockStatus() {
  const lock = readJsonSafe(LOCK_FILE, null);
  if (!lock || !lock.started_at) return { active: false, stale: false, lock: null };
  const age = Date.now() - Date.parse(lock.started_at);
  const active = Number.isFinite(age) && age >= 0 && age < LOCK_TTL_MS;
  return { active, stale: !active, lock };
}

function getOverview() {
  ensureDir(GLOBAL_DIR);
  ensureDir(PROJECTS_DIR);
  const state = readJsonSafe(STATE_FILE, { last_successful_run_at: null, conversations: {} });
  const queue = readJsonSafe(QUEUE_FILE, { items: {} });
  const lockStatus = getLockStatus();

  // Build daily activity map across all project rollouts (for sparklines + 53-week heatmap)
  const activityByDate = {};
  const trendDays = 14;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dayMap = new Map();
  const daily_trend = [];
  for (let i = trendDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const key = `${yyyy}-${mm}-${dd}`;
    const entry = { date: key, label: `${mm}/${dd}`, rollouts: 0, bytes: 0 };
    dayMap.set(key, entry);
    daily_trend.push(entry);
  }

  const cfg = loadConfig();
  const scopes = listScopes().map((name) => {
    const dir = getScopeDir(name);
    const summaryText = readTextSafe(path.join(dir, 'memory_summary.md'));
    const rolloutDir = path.join(dir, 'rollout_summaries');
    const notesDir = path.join(dir, 'ad_hoc_notes');
    let rolloutCount = 0;
    if (fs.existsSync(rolloutDir)) {
      const files = fs.readdirSync(rolloutDir).filter((f) => f.endsWith('.md'));
      rolloutCount = files.length;
      for (const f of files) {
        try {
          const stat = fs.statSync(path.join(rolloutDir, f));
          const m = f.match(/^(\d{4}-\d{2}-\d{2})/);
          const dateKey = m ? m[1] : stat.mtime.toISOString().slice(0, 10);
          const bucket = dayMap.get(dateKey);
          if (bucket) {
            bucket.rollouts += 1;
            bucket.bytes += stat.size;
          }
          if (!activityByDate[dateKey]) {
            activityByDate[dateKey] = { rollouts: 0, bytes: 0 };
          }
          activityByDate[dateKey].rollouts += 1;
          activityByDate[dateKey].bytes += stat.size;
        } catch {
          // ignore
        }
      }
    }
    const noteCount = fs.existsSync(notesDir)
      ? fs.readdirSync(notesDir).filter((f) => f.endsWith('.md')).length
      : 0;
    return {
      name,
      bytes: Buffer.byteLength(summaryText, 'utf8'),
      budget: name === 'global' ? cfg.global_budget : cfg.project_budget,
      rollout_count: rolloutCount,
      note_count: noteCount
    };
  });

  return {
    last_successful_run_at: state.last_successful_run_at || null,
    tracked_conversations: Object.keys(state.conversations || {}).length,
    queue_count: Object.keys(queue.items || {}).length,
    queue_items: Object.values(queue.items || {}),
    lock: lockStatus,
    model: cfg.model,
    schedule: `${cfg.schedule_time} Asia/Shanghai`,
    config: cfg,
    supermemory_mcp: detectSupermemoryMcp(),
    scopes,
    daily_trend,
    activity_by_date: activityByDate
  };
}

function getScopeDetail(scope) {
  const cfg = loadConfig();
  const dir = getScopeDir(scope);
  ensureDir(dir);
  const summary = readTextSafe(path.join(dir, 'memory_summary.md'));

  const rolloutDir = path.join(dir, 'rollout_summaries');
  const rollouts = [];
  if (fs.existsSync(rolloutDir)) {
    for (const file of fs.readdirSync(rolloutDir).filter((f) => f.endsWith('.md'))) {
      const full = path.join(rolloutDir, file);
      const stat = fs.statSync(full);
      const head = readTextSafe(full).split(/\r?\n/)[0]?.replace(/^#\s*/, '') || file;
      const m = file.match(/^(\d{4}-\d{2}-\d{2})/);
      const date = m ? m[1] : stat.mtime.toISOString().slice(0, 10);
      rollouts.push({ file, title: head, date, bytes: stat.size, mtime: stat.mtime.toISOString() });
    }
    rollouts.sort((a, b) => b.date.localeCompare(a.date) || b.mtime.localeCompare(a.mtime));
  }

  const notesDir = path.join(dir, 'ad_hoc_notes');
  const notes = [];
  if (fs.existsSync(notesDir)) {
    for (const file of fs.readdirSync(notesDir).filter((f) => f.endsWith('.md'))) {
      const full = path.join(notesDir, file);
      const stat = fs.statSync(full);
      notes.push({ file, content: readTextSafe(full).trim(), mtime: stat.mtime.toISOString() });
    }
    notes.sort((a, b) => b.mtime.localeCompare(a.mtime));
  }

  return {
    scope,
    summary,
    bytes: Buffer.byteLength(summary, 'utf8'),
    budget: scope === 'global' ? cfg.global_budget : cfg.project_budget,
    rollouts,
    notes
  };
}

function triggerConsolidation() {
  const lockStatus = getLockStatus();
  if (lockStatus.active) {
    return { started: false, reason: '已有整理任务正在运行中' };
  }
  const cfg = loadConfig();
  writeJsonAtomic(LOCK_FILE, {
    pid: process.pid,
    reason: 'dashboard-manual-trigger',
    started_at: new Date().toISOString()
  });
  const prompt = `${CONSOLIDATION_MARKER} Follow the codex-memory-pipeline skill at C:\\Users\\dzc\\.gemini\\config\\skills\\codex-memory-pipeline\\SKILL.md to run a manual memory consolidation now.`;
  const child = spawn(
    'agentapi',
    ['new-conversation', `--model=${cfg.model}`, '--title=Memory Consolidation', '--', prompt],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      shell: process.platform === 'win32'
    }
  );
  child.unref();
  return { started: true };
}

const APP_ONLY_META = { ui: { visibility: ['app'] } };

const TOOLS = [
  {
    name: 'open_memory_dashboard',
    title: 'Memory',
    description: 'Open the Codex v2 + Supermemory management dashboard.',
    inputSchema: { type: 'object', properties: {} },
    _meta: {
      ui: { resourceUri: APP_URI },
      'com.google.antigravity/ui': {
        entrypoints: [
          { type: 'global', title: 'Memory' },
          { type: 'aux_pane', title: 'Memory' }
        ]
      }
    }
  },
  {
    name: 'memory_get_overview',
    title: 'Get Memory Overview',
    description: 'App-only: get consolidation status, queue count, and scopes.',
    inputSchema: { type: 'object', properties: {} },
    _meta: APP_ONLY_META
  },
  {
    name: 'memory_get_scope',
    title: 'Get Memory Scope',
    description: 'App-only: get memory_summary.md, rollout summaries, and ad-hoc notes for one scope.',
    inputSchema: {
      type: 'object',
      properties: { scope: { type: 'string' } },
      required: ['scope']
    },
    _meta: APP_ONLY_META
  },
  {
    name: 'memory_save_summary',
    title: 'Save Memory Summary',
    description: 'App-only: save memory_summary.md for a scope.',
    inputSchema: {
      type: 'object',
      properties: { scope: { type: 'string' }, content: { type: 'string' } },
      required: ['scope', 'content']
    },
    _meta: APP_ONLY_META
  },
  {
    name: 'memory_add_note',
    title: 'Add Ad-Hoc Note',
    description: 'App-only: append an ad-hoc remember/forget/correction note.',
    inputSchema: {
      type: 'object',
      properties: { scope: { type: 'string' }, content: { type: 'string' } },
      required: ['scope', 'content']
    },
    _meta: APP_ONLY_META
  },
  {
    name: 'memory_delete_note',
    title: 'Delete Ad-Hoc Note',
    description: 'App-only: delete an ad-hoc note file.',
    inputSchema: {
      type: 'object',
      properties: { scope: { type: 'string' }, file: { type: 'string' } },
      required: ['scope', 'file']
    },
    _meta: APP_ONLY_META
  },
  {
    name: 'memory_read_rollout',
    title: 'Read Rollout Summary',
    description: 'App-only: read one rollout summary markdown file.',
    inputSchema: {
      type: 'object',
      properties: { scope: { type: 'string' }, file: { type: 'string' } },
      required: ['scope', 'file']
    },
    _meta: APP_ONLY_META
  },
  {
    name: 'memory_delete_rollout',
    title: 'Delete Rollout Summary',
    description: 'App-only: delete one rollout summary markdown file.',
    inputSchema: {
      type: 'object',
      properties: { scope: { type: 'string' }, file: { type: 'string' } },
      required: ['scope', 'file']
    },
    _meta: APP_ONLY_META
  },
  {
    name: 'memory_trigger_consolidation',
    title: 'Trigger Consolidation',
    description: 'App-only: start an immediate background consolidation run.',
    inputSchema: { type: 'object', properties: {} },
    _meta: APP_ONLY_META
  },
  {
    name: 'memory_unlock',
    title: 'Release Consolidation Lock',
    description: 'App-only: remove consolidation.lock.',
    inputSchema: { type: 'object', properties: {} },
    _meta: APP_ONLY_META
  },
  {
    name: 'memory_save_config',
    title: 'Save Memory Config',
    description: 'App-only: save memory settings to config.json.',
    inputSchema: {
      type: 'object',
      properties: {
        supermemory_enabled: { type: 'boolean' },
        schedule_time: { type: 'string' },
        model: { type: 'string' },
        max_inject_bytes: { type: 'number' },
        global_ratio: { type: 'number' }
      }
    },
    _meta: APP_ONLY_META
  },
  {
    name: 'memory_reload_ui',
    title: 'Hot Reload Dashboard UI',
    description: 'App-only: read the latest built dist/dashboard.html from disk for in-place hot reload.',
    inputSchema: { type: 'object', properties: {} },
    _meta: APP_ONLY_META
  }
];

function callTool(name, args = {}) {
  switch (name) {
    case 'open_memory_dashboard': {
      const overview = getOverview();
      const firstProject = overview.scopes.find((s) => s.name !== 'global')?.name || 'global';
      const detail = getScopeDetail(firstProject);
      return {
        content: [{ type: 'text', text: `Memory Dashboard opened (${overview.tracked_conversations} tracked, ${overview.queue_count} queued).` }],
        structuredContent: { overview, detail }
      };
    }
    case 'memory_get_overview': {
      const overview = getOverview();
      return { content: [{ type: 'text', text: 'ok' }], structuredContent: overview };
    }
    case 'memory_get_scope': {
      const detail = getScopeDetail(args.scope || 'global');
      return { content: [{ type: 'text', text: 'ok' }], structuredContent: detail };
    }
    case 'memory_save_summary': {
      const dir = getScopeDir(args.scope || 'global');
      ensureDir(dir);
      fs.writeFileSync(path.join(dir, 'memory_summary.md'), String(args.content ?? ''), 'utf8');
      return { content: [{ type: 'text', text: 'saved' }], structuredContent: { ok: true } };
    }
    case 'memory_add_note': {
      const dir = path.join(getScopeDir(args.scope || 'global'), 'ad_hoc_notes');
      ensureDir(dir);
      const file = `${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
      fs.writeFileSync(path.join(dir, file), String(args.content || '').trim() + '\n', 'utf8');
      return { content: [{ type: 'text', text: 'added' }], structuredContent: { ok: true, file } };
    }
    case 'memory_delete_note': {
      const file = args.file || '';
      if (!isSafeSegment(file) || !file.endsWith('.md')) throw new Error('Invalid file');
      const target = path.join(getScopeDir(args.scope || 'global'), 'ad_hoc_notes', file);
      if (fs.existsSync(target)) fs.unlinkSync(target);
      return { content: [{ type: 'text', text: 'deleted' }], structuredContent: { ok: true } };
    }
    case 'memory_read_rollout': {
      const file = args.file || '';
      if (!isSafeSegment(file) || !file.endsWith('.md')) throw new Error('Invalid file');
      const target = path.join(getScopeDir(args.scope || ''), 'rollout_summaries', file);
      return { content: [{ type: 'text', text: 'ok' }], structuredContent: { content: readTextSafe(target) } };
    }
    case 'memory_reload_ui': {
      const html = readTextSafe(HTML_PATH);
      if (!html) throw new Error('dist/dashboard.html 不存在，请先构建');
      const mtimeMs = fs.statSync(HTML_PATH).mtimeMs;
      return { content: [{ type: 'text', text: 'ok' }], structuredContent: { html, mtime_ms: mtimeMs } };
    }
    case 'memory_delete_rollout': {
      const file = args.file || '';
      if (!isSafeSegment(file) || !file.endsWith('.md')) throw new Error('Invalid file');
      const target = path.join(getScopeDir(args.scope || ''), 'rollout_summaries', file);
      if (fs.existsSync(target)) fs.unlinkSync(target);
      return { content: [{ type: 'text', text: 'deleted' }], structuredContent: { ok: true } };
    }
    case 'memory_trigger_consolidation': {
      const res = triggerConsolidation();
      return { content: [{ type: 'text', text: res.started ? 'started' : res.reason }], structuredContent: res };
    }
    case 'memory_unlock': {
      if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
      return { content: [{ type: 'text', text: 'unlocked' }], structuredContent: { ok: true } };
    }
    case 'memory_save_config': {
      const config = saveConfig(args);
      return { content: [{ type: 'text', text: 'saved' }], structuredContent: { ok: true, config } };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function writeMessage(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function handleRequest(req) {
  const { id, method, params } = req;
  if (id === undefined) {
    // Notification (e.g. notifications/initialized) — no response
    return;
  }
  try {
    if (method === 'initialize') {
      writeMessage({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: params?.protocolVersion || '2024-11-05',
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'memory-dashboard', version: '1.0.0' }
        }
      });
      return;
    }
    if (method === 'ping') {
      writeMessage({ jsonrpc: '2.0', id, result: {} });
      return;
    }
    if (method === 'tools/list') {
      writeMessage({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
      return;
    }
    if (method === 'tools/call') {
      const result = callTool(params?.name, params?.arguments || {});
      writeMessage({ jsonrpc: '2.0', id, result });
      return;
    }
    if (method === 'resources/list') {
      writeMessage({
        jsonrpc: '2.0',
        id,
        result: {
          resources: [
            {
              uri: APP_URI,
              name: 'Memory Dashboard',
              mimeType: 'text/html;profile=mcp-app',
              _meta: { ui: { prefersBorder: false } }
            }
          ]
        }
      });
      return;
    }
    if (method === 'resources/read') {
      if (params?.uri !== APP_URI) {
        writeMessage({ jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown resource: ${params?.uri}` } });
        return;
      }
      const html = readTextSafe(HTML_PATH) || '<!doctype html><html><body>Dashboard HTML not built yet.</body></html>';
      writeMessage({
        jsonrpc: '2.0',
        id,
        result: {
          contents: [
            {
              uri: APP_URI,
              mimeType: 'text/html;profile=mcp-app',
              text: html,
              _meta: { ui: { prefersBorder: false } }
            }
          ]
        }
      });
      return;
    }
    writeMessage({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (err) {
    writeMessage({
      jsonrpc: '2.0',
      id,
      result: {
        isError: true,
        content: [{ type: 'text', text: err?.message || String(err) }]
      }
    });
  }
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    handleRequest(JSON.parse(trimmed));
  } catch (err) {
    process.stderr.write(`Parse error: ${err?.message}\n`);
  }
});
