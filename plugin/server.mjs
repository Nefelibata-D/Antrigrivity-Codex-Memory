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
import { execFileSync } from 'node:child_process';
import readline from 'node:readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTML_PATH = path.join(__dirname, 'dist', 'dashboard.html');
const PLUGIN_JSON_PATH = path.join(__dirname, 'plugin.json');
const GITHUB_REPO = 'Nefelibata-D/Antrigrivity-Codex-Memory';
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
const STAGING_DIR = path.join(MEMORIES_DIR, 'staging');
const BRAIN_DIR = path.join(HOME, '.gemini', 'antigravity', 'brain');
const SUMMARIES_DB = path.join(HOME, '.gemini', 'antigravity', 'conversation_summaries.db');
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

function extractTitleFromTranscript(filePath, maxChars = 80) {
  if (!filePath) return '';
  try {
    if (!fs.existsSync(filePath)) return '';
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(65536);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    if (bytesRead <= 0) return '';
    const lines = buf.subarray(0, bytesRead).toString('utf8').split(/\r?\n/);
    for (const rawLine of lines) {
      if (!rawLine.trim()) continue;
      let obj;
      try {
        obj = JSON.parse(rawLine);
      } catch {
        continue;
      }
      if (obj.type === 'USER_INPUT' && typeof obj.content === 'string') {
        const m = obj.content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
        const text = (m ? m[1] : obj.content).trim();
        if (!text) continue;
        const firstLine = text
          .split(/\r?\n/)
          .map((l) => l.replace(/^[#>*\-\s`]+/, '').trim())
          .find((l) => l.length > 0) || '';
        const cleaned = firstLine.replace(/\s+/g, ' ').trim();
        if (cleaned) {
          return cleaned.length > maxChars ? cleaned.slice(0, maxChars).trimEnd() + '…' : cleaned;
        }
      }
    }
  } catch {
    // ignore
  }
  return '';
}

async function fetchConversationMetaFromDB(convIds) {
  const map = new Map();
  if (!Array.isArray(convIds) || convIds.length === 0 || !fs.existsSync(SUMMARIES_DB)) return map;
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(SUMMARIES_DB, { readOnly: true });
    try {
      const stmt = db.prepare(
        'SELECT conversation_id, title, preview, parent_conversation_id, nesting_depth FROM conversation_summaries WHERE conversation_id = ?'
      );
      for (const id of convIds) {
        if (!id) continue;
        const row = stmt.get(id);
        if (row) {
          map.set(id, {
            title: String(row.title || row.preview || '').trim(),
            isSubagent: Boolean(row.parent_conversation_id) || Number(row.nesting_depth || 0) > 0
          });
        }
      }
    } finally {
      db.close();
    }
  } catch {
    // ignore sqlite failure
  }
  return map;
}

async function fetchConversationTitlesFromLS(convIds) {
  const map = new Map();
  const addr = process.env.ANTIGRAVITY_LS_ADDRESS;
  const tok = process.env.ANTIGRAVITY_CSRF_TOKEN;
  if (!addr || !tok || !Array.isArray(convIds) || convIds.length === 0) return map;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const res = await fetch(`http://${addr}/product.v1.ConversationService/ListConversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
        'x-antigravity-csrf-token': tok
      },
      body: JSON.stringify({ pageSize: 100, includeArchived: true }),
      signal: controller.signal
    });
    if (res.ok) {
      const data = await res.json();
      for (const c of data?.conversations || []) {
        const t = c?.annotations?.title?.trim() || c?.state?.summary?.trim() || '';
        if (c?.id && t) map.set(c.id, t);
      }
    }
  } catch {
    // ignore LS lookup failure
  } finally {
    clearTimeout(timer);
  }
  return map;
}

function resolveConversationTitle(item, dbMetaMap, lsTitleMap) {
  const id = item?.conversation_id || '';
  const dbTitle = id ? dbMetaMap?.get(id)?.title : '';
  if (dbTitle) return dbTitle;
  if (id && lsTitleMap?.has(id)) return lsTitleMap.get(id);
  if (item?.title && String(item.title).trim()) return String(item.title).trim();
  const candidates = [
    item?.staged_path,
    id ? path.join(STAGING_DIR, `${id}.jsonl`) : '',
    item?.transcript_path,
    id ? path.join(BRAIN_DIR, id, '.system_generated', 'logs', 'transcript.jsonl') : ''
  ].filter(Boolean);
  for (const p of candidates) {
    const t = extractTitleFromTranscript(p);
    if (t) return t;
  }
  return id;
}

function getLockStatus() {
  const lock = readJsonSafe(LOCK_FILE, null);
  if (!lock || !lock.started_at) return { active: false, stale: false, lock: null };
  const age = Date.now() - Date.parse(lock.started_at);
  const active = Number.isFinite(age) && age >= 0 && age < LOCK_TTL_MS;
  return { active, stale: !active, lock };
}

async function getOverview() {
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

  const rawQueueItems = Object.values(queue.items || {});
  const ids = rawQueueItems.map((it) => it.conversation_id);
  const dbMetaMap = await fetchConversationMetaFromDB(ids);
  const missingIds = ids.filter((id) => !dbMetaMap.get(id)?.title);
  const lsTitleMap = missingIds.length > 0 ? await fetchConversationTitlesFromLS(missingIds) : new Map();
  const queueItems = rawQueueItems
    .filter((it) => !dbMetaMap.get(it.conversation_id)?.isSubagent)
    .map((it) => ({
      ...it,
      title: resolveConversationTitle(it, dbMetaMap, lsTitleMap)
    }));

  return {
    last_successful_run_at: state.last_successful_run_at || null,
    tracked_conversations: Object.keys(state.conversations || {}).length,
    queue_count: queueItems.length,
    queue_items: queueItems,
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
  },
  {
    name: 'memory_check_update',
    title: 'Check Plugin Update',
    description: 'App-only: check GitHub Releases for a newer version of Antigrivity Memory.',
    inputSchema: { type: 'object', properties: {} },
    _meta: APP_ONLY_META
  },
  {
    name: 'memory_apply_update',
    title: 'Apply Plugin Update',
    description: 'App-only: download the latest GitHub Release tarball and run install.mjs --force --skip-npm.',
    inputSchema: {
      type: 'object',
      properties: { tag: { type: 'string' } }
    },
    _meta: APP_ONLY_META
  }
];

function getCurrentVersion() {
  const pkg = readJsonSafe(PLUGIN_JSON_PATH, {});
  return String(pkg.version || '1.0.0').replace(/^v/i, '');
}

function compareSemver(a, b) {
  const pa = String(a || '0.0.0').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0.0.0').replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'antigrivity-memory-updater',
      'Accept': 'application/vnd.github+json'
    }
  });
  if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
  return res.json();
}

async function checkUpdate() {
  const current = getCurrentVersion();
  const checkedAt = new Date().toISOString();
  try {
    const rel = await fetchJson(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    const tag = String(rel.tag_name || '');
    const latest = tag.replace(/^v/i, '') || current;
    return {
      current_version: current,
      latest_version: latest,
      latest_tag: tag || `v${latest}`,
      has_update: compareSemver(latest, current) > 0,
      release_name: rel.name || tag,
      release_notes: rel.body || '',
      release_url: rel.html_url || `https://github.com/${GITHUB_REPO}/releases`,
      published_at: rel.published_at || '',
      checked_at: checkedAt
    };
  } catch (err) {
    // Fallback to tags if no formal release exists yet
    try {
      const tags = await fetchJson(`https://api.github.com/repos/${GITHUB_REPO}/tags?per_page=1`);
      if (Array.isArray(tags) && tags.length > 0) {
        const tag = String(tags[0].name || '');
        const latest = tag.replace(/^v/i, '') || current;
        return {
          current_version: current,
          latest_version: latest,
          latest_tag: tag,
          has_update: compareSemver(latest, current) > 0,
          release_name: tag,
          release_notes: '',
          release_url: `https://github.com/${GITHUB_REPO}/releases/tag/${tag}`,
          published_at: '',
          checked_at: checkedAt
        };
      }
    } catch {
      // ignore fallback error
    }
    return {
      current_version: current,
      latest_version: current,
      latest_tag: `v${current}`,
      has_update: false,
      release_name: '',
      release_notes: '',
      release_url: `https://github.com/${GITHUB_REPO}/releases`,
      published_at: '',
      checked_at: checkedAt,
      error: err?.message || String(err)
    };
  }
}

async function applyUpdate(requestedTag) {
  const info = await checkUpdate();
  const tag = requestedTag || info.latest_tag;
  if (!tag) throw new Error('未找到可用的目标版本 Tag');

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-mem-upd-'));
  const tarPath = path.join(tmpRoot, 'release.tar.gz');
  const extractDir = path.join(tmpRoot, 'src');
  fs.mkdirSync(extractDir, { recursive: true });

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/tarball/${encodeURIComponent(tag)}`, {
      headers: { 'User-Agent': 'antigrivity-memory-updater' },
      redirect: 'follow'
    });
    if (!res.ok) throw new Error(`下载更新包失败 (HTTP ${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tarPath, buf);

    execFileSync('tar', ['-xzf', tarPath, '-C', extractDir, '--strip-components=1'], {
      stdio: 'ignore',
      windowsHide: true
    });

    const installer = path.join(extractDir, 'install.mjs');
    if (!fs.existsSync(installer)) {
      throw new Error('更新包中未找到 install.mjs');
    }
    execFileSync(process.execPath, [installer, '--force', '--skip-npm'], {
      cwd: extractDir,
      stdio: 'ignore',
      windowsHide: true
    });

    return {
      ok: true,
      updated_to: tag,
      message: `已成功更新到 ${tag}，请点击顶部「热重载」加载最新界面。`
    };
  } finally {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  }
}

async function callTool(name, args = {}) {
  switch (name) {
    case 'open_memory_dashboard': {
      const overview = await getOverview();
      const firstProject = overview.scopes.find((s) => s.name !== 'global')?.name || 'global';
      const detail = getScopeDetail(firstProject);
      return {
        content: [{ type: 'text', text: `Memory Dashboard opened (${overview.tracked_conversations} tracked, ${overview.queue_count} queued).` }],
        structuredContent: { overview, detail }
      };
    }
    case 'memory_get_overview': {
      const overview = await getOverview();
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
    case 'memory_check_update': {
      const info = await checkUpdate();
      return { content: [{ type: 'text', text: 'ok' }], structuredContent: info };
    }
    case 'memory_apply_update': {
      const res = await applyUpdate(args.tag);
      return { content: [{ type: 'text', text: res.message }], structuredContent: res };
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

async function handleRequest(req) {
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
      const result = await callTool(params?.name, params?.arguments || {});
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
