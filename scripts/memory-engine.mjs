#!/usr/bin/env node
/**
 * Antigravity × Codex v2 × Supermemory local memory engine.
 * Subcommands:
 *   session-start            Hook handler for SessionStart (hot inject + missed-run catch-up)
 *   enqueue                  Hook handler for Stop (queue current conversation)
 *   scan [options]           Discover pending transcript deltas & ad_hoc notes
 *   commit [options]         Atomically advance watermark for one conversation
 *   finish-run               Record last_successful_run_at and release lock
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const HOME = os.homedir();
const CONFIG_DIR = path.join(HOME, '.gemini', 'config');
const MEMORIES_DIR = path.join(CONFIG_DIR, 'memories');
const GLOBAL_DIR = path.join(MEMORIES_DIR, 'global');
const PROJECTS_DIR = path.join(MEMORIES_DIR, 'projects');
const BRAIN_DIR = path.join(HOME, '.gemini', 'antigravity', 'brain');

const STATE_FILE = path.join(MEMORIES_DIR, 'state.json');
const QUEUE_FILE = path.join(MEMORIES_DIR, 'queue.json');
const LOCK_FILE = path.join(MEMORIES_DIR, 'consolidation.lock');
const CONFIG_FILE = path.join(MEMORIES_DIR, 'config.json');

const CONSOLIDATION_MARKER = '[CODEX-MEMORY-CONSOLIDATION]';
const DEFAULT_CONFIG = {
  supermemory_enabled: true,
  schedule_time: '23:30',
  model: 'gemini-4-hydrogen-medium',
  max_inject_bytes: 8900,
  global_ratio: 33
};

function loadConfig() {
  const raw = readJsonSafe(CONFIG_FILE, {});
  return {
    supermemory_enabled: typeof raw.supermemory_enabled === 'boolean' ? raw.supermemory_enabled : DEFAULT_CONFIG.supermemory_enabled,
    schedule_time: typeof raw.schedule_time === 'string' && /^\d{2}:\d{2}$/.test(raw.schedule_time) ? raw.schedule_time : DEFAULT_CONFIG.schedule_time,
    model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : DEFAULT_CONFIG.model,
    max_inject_bytes: Number.isFinite(Number(raw.max_inject_bytes)) ? Math.max(3000, Math.min(32000, Math.round(Number(raw.max_inject_bytes)))) : DEFAULT_CONFIG.max_inject_bytes,
    global_ratio: Number.isFinite(Number(raw.global_ratio)) ? Math.max(10, Math.min(80, Math.round(Number(raw.global_ratio)))) : DEFAULT_CONFIG.global_ratio
  };
}

const MAX_DELTA_CHARS = 16000;
const LOCK_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CATCHUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function ensureBaseLayout() {
  ensureDir(MEMORIES_DIR);
  ensureDir(GLOBAL_DIR);
  ensureDir(path.join(GLOBAL_DIR, 'ad_hoc_notes'));
  ensureDir(PROJECTS_DIR);
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filePath);
}

function normalizeNamespace(workspacePath) {
  if (!workspacePath || typeof workspacePath !== 'string') return '';
  const cleaned = workspacePath.replace(/[\\/]+$/, '');
  const base = path.basename(cleaned).trim().toLowerCase();
  return base.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function truncateUtf8Bytes(str, maxBytes) {
  const buf = Buffer.from(str, 'utf8');
  if (buf.length <= maxBytes) return str;
  const notice = '\n...[truncated to fit 8,900-byte budget]';
  const budget = Math.max(0, maxBytes - Buffer.byteLength(notice, 'utf8'));
  let sliced = buf.subarray(0, budget).toString('utf8');
  // Strip trailing replacement char from split multibyte sequence
  sliced = sliced.replace(/\uFFFD+$/, '');
  return sliced + notice;
}

function readStdinJson() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { raw += chunk; });
    process.stdin.on('end', () => {
      try {
        resolve(raw.trim() ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

function defaultState() {
  return {
    version: 1,
    last_successful_run_at: null,
    conversations: {},
    ignored: {}
  };
}

function loadState() {
  const s = readJsonSafe(STATE_FILE, defaultState());
  s.conversations ||= {};
  s.ignored ||= {};
  return s;
}

function loadQueue() {
  const q = readJsonSafe(QUEUE_FILE, { items: {} });
  q.items ||= {};
  return q;
}

function isLockActive() {
  const lock = readJsonSafe(LOCK_FILE, null);
  if (!lock || !lock.started_at) return false;
  const age = Date.now() - Date.parse(lock.started_at);
  return Number.isFinite(age) && age >= 0 && age < LOCK_TTL_MS;
}

function acquireLock(reason = 'manual') {
  if (isLockActive()) return false;
  writeJsonAtomic(LOCK_FILE, {
    pid: process.pid,
    reason,
    started_at: new Date().toISOString()
  });
  return true;
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch {
    // ignore
  }
}

function listBrainTranscripts() {
  const results = [];
  if (!fs.existsSync(BRAIN_DIR)) return results;
  let entries = [];
  try {
    entries = fs.readdirSync(BRAIN_DIR, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const convId = ent.name;
    const tPath = path.join(BRAIN_DIR, convId, '.system_generated', 'logs', 'transcript.jsonl');
    try {
      const stat = fs.statSync(tPath);
      if (stat.isFile() && stat.size > 0) {
        results.push({ conversation_id: convId, transcript_path: tPath, mtime_ms: stat.mtimeMs, size: stat.size });
      }
    } catch {
      // skip
    }
  }
  return results;
}

function hasPendingWork(state, queue) {
  if (Object.keys(queue.items).length > 0) return true;
  const transcripts = listBrainTranscripts();
  const now = Date.now();
  for (const item of transcripts) {
    if (state.ignored[item.conversation_id]) continue;
    if (now - item.mtime_ms < 120 * 1000) continue; // skip active
    const prev = state.conversations[item.conversation_id];
    if (!prev || item.mtime_ms > (prev.last_mtime_ms || 0) + 1000) {
      return true;
    }
  }
  return false;
}

function shouldTriggerCatchup(state, queue) {
  if (isLockActive()) return false;
  const lastRunMs = state.last_successful_run_at ? Date.parse(state.last_successful_run_at) : 0;
  const now = Date.now();

  let overdue = false;
  if (!lastRunMs || Number.isNaN(lastRunMs)) {
    // First time ever: only catch up if there is actual pending work
    overdue = hasPendingWork(state, queue);
  } else if (now - lastRunMs >= CATCHUP_INTERVAL_MS) {
    overdue = hasPendingWork(state, queue);
  } else {
    // Also check if yesterday's scheduled local window was missed
    const cfg = loadConfig();
    const [hh, mm] = cfg.schedule_time.split(':').map(Number);
    const lastNight = new Date();
    lastNight.setHours(hh || 23, mm || 30, 0, 0);
    if (lastNight.getTime() > now) {
      lastNight.setDate(lastNight.getDate() - 1);
    }
    if (lastRunMs < lastNight.getTime()) {
      overdue = hasPendingWork(state, queue);
    }
  }
  return overdue;
}

function spawnCatchupRun() {
  if (!acquireLock('session-start-catchup')) return false;
  const cfg = loadConfig();
  const prompt = `${CONSOLIDATION_MARKER} Follow the codex-memory-pipeline skill at C:\\Users\\dzc\\.gemini\\config\\skills\\codex-memory-pipeline\\SKILL.md to run a missed-schedule memory consolidation now.`;
  try {
    const child = spawn(
      'agentapi',
      ['new-conversation', `--model=${cfg.model}`, '--title=Memory Catch-up Consolidation', '--', prompt],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        shell: process.platform === 'win32'
      }
    );
    child.unref();
    return true;
  } catch {
    releaseLock();
    return false;
  }
}

function readTextIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

async function cmdSessionStart() {
  ensureBaseLayout();
  const payload = await readStdinJson();
  const lastInput = typeof payload.lastUserInput === 'string' ? payload.lastUserInput : '';
  if (lastInput.includes(CONSOLIDATION_MARKER)) {
    process.stdout.write(JSON.stringify({}));
    return;
  }

  const ws = (Array.isArray(payload.workspacePaths) && payload.workspacePaths[0]) || payload.cwd || '';
  const ns = normalizeNamespace(ws);

  const globalSummary = readTextIfExists(path.join(GLOBAL_DIR, 'memory_summary.md'));
  const projectSummary = ns ? readTextIfExists(path.join(PROJECTS_DIR, ns, 'memory_summary.md')) : '';

  const state = loadState();
  const queue = loadQueue();
  if (shouldTriggerCatchup(state, queue)) {
    spawnCatchupRun();
  }

  const sections = [];
  sections.push('## Memory (Codex v2 + Supermemory)');
  sections.push(
    'Use the injected MEMORY_SUMMARY as historical context: apply the user\'s actual preferences, corrections, decisions, and supported task scope. ' +
    'Read a matching local rollout summary under `C:\\Users\\dzc\\.gemini\\config\\memories\\projects\\<project>\\rollout_summaries\\` when its evidence or chronology could change your answer; otherwise do not retrieve history speculatively. ' +
    'For older or cross-project details not listed below, call `supermemory.search_memory` (namespace `' + (ns || 'default') + '`). ' +
    'Memory is not proof of current behavior—verify against actual code when warranted. ' +
    'For an explicit remember/forget/correction request, append a brief note under `C:\\Users\\dzc\\.gemini\\config\\memories\\' +
    (ns ? `projects\\${ns}\\ad_hoc_notes\\` : 'global\\ad_hoc_notes\\') +
    '` and sync via `supermemory.add_memory` / `forget_memory`.'
  );

  if (globalSummary || projectSummary) {
    sections.push('========= MEMORY_SUMMARY BEGINS =========');
    if (globalSummary) {
      sections.push('### [Global Memory Summary]\n' + globalSummary);
    }
    if (projectSummary) {
      sections.push(`### [Project Memory Summary: ${ns}]\n` + projectSummary);
    }
    sections.push('========= MEMORY_SUMMARY ENDS =========');
  } else {
    sections.push(
      `No local memory_summary.md exists yet for namespace "${ns || 'global'}". ` +
      'On the first substantive turn, you may call `supermemory.get_profile` or `supermemory.search_memory` if historical context is relevant.'
    );
  }

  const cfg = loadConfig();
  const systemMessage = truncateUtf8Bytes(sections.join('\n\n'), cfg.max_inject_bytes);
  process.stdout.write(JSON.stringify({
    injectSteps: [{ systemMessage: { systemMessage } }]
  }));
}

async function cmdEnqueue() {
  ensureBaseLayout();
  const payload = await readStdinJson();
  const convId = payload.conversationId;
  const lastInput = typeof payload.lastUserInput === 'string' ? payload.lastUserInput : '';

  if (!convId || lastInput.includes(CONSOLIDATION_MARKER)) {
    process.stdout.write(JSON.stringify({ decision: 'allow' }));
    return;
  }

  const ws = (Array.isArray(payload.workspacePaths) && payload.workspacePaths[0]) || payload.cwd || '';
  const ns = normalizeNamespace(ws);
  const transcriptPath = payload.transcriptPath || path.join(BRAIN_DIR, convId, '.system_generated', 'logs', 'transcript.jsonl');

  const queue = loadQueue();
  queue.items[convId] = {
    conversation_id: convId,
    namespace: ns || 'global',
    workspace: ws,
    transcript_path: transcriptPath,
    queued_at: new Date().toISOString()
  };
  writeJsonAtomic(QUEUE_FILE, queue);
  process.stdout.write(JSON.stringify({ decision: 'allow' }));
}

function extractUserRequest(content) {
  if (!content || typeof content !== 'string') return '';
  const m = content.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/);
  const text = (m ? m[1] : content).trim();
  return text;
}

function inferNamespaceFromLines(lines) {
  const sample = lines.slice(0, 15).join('\n');
  // Look for explicit namespace mention in prior SessionStart hook or file paths
  const nsMatch = sample.match(/namespace\s+([a-z0-9_-]+)/i);
  if (nsMatch && nsMatch[1] && nsMatch[1] !== 'default') {
    return nsMatch[1].toLowerCase();
  }
  const pathMatch = sample.match(/[A-Za-z]:\\+MyProject\\+([A-Za-z0-9 _-]+?)\\+/);
  if (pathMatch && pathMatch[1]) {
    return normalizeNamespace(pathMatch[1]);
  }
  return 'global';
}

function renderDelta(lines, fromLine) {
  const slice = lines.slice(fromLine);
  const rendered = [];
  let userTurnCount = 0;

  for (const rawLine of slice) {
    if (!rawLine.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(rawLine);
    } catch {
      continue;
    }

    if (obj.type === 'USER_INPUT') {
      const req = extractUserRequest(obj.content);
      if (req) {
        userTurnCount += 1;
        rendered.push(`[USER @ ${obj.created_at || ''}]\n${req}`);
      }
    } else if (obj.type === 'PLANNER_RESPONSE') {
      const parts = [];
      if (obj.content && obj.content.trim()) {
        const text = obj.content.trim();
        parts.push(text.length > 2000 ? text.slice(0, 2000) + '\n...[truncated]' : text);
      }
      if (Array.isArray(obj.tool_calls) && obj.tool_calls.length > 0) {
        const tools = obj.tool_calls.map((t) => {
          const argKeys = t.args ? Object.keys(t.args).slice(0, 3).join(',') : '';
          return `${t.name}(${argKeys})`;
        });
        parts.push(`Tool calls: ${tools.join('; ')}`);
      }
      if (parts.length > 0) {
        rendered.push(`[ASSISTANT @ ${obj.created_at || ''}]\n${parts.join('\n')}`);
      }
    } else if (obj.type === 'ERROR_MESSAGE' && obj.error) {
      rendered.push(`[ERROR] ${String(obj.error).slice(0, 300)}`);
    }
  }

  let joined = rendered.join('\n\n---\n\n');
  if (joined.length > MAX_DELTA_CHARS) {
    const head = joined.slice(0, Math.floor(MAX_DELTA_CHARS * 0.45));
    const tail = joined.slice(-Math.floor(MAX_DELTA_CHARS * 0.50));
    joined = `${head}\n\n...[middle delta omitted for token budget]...\n\n${tail}`;
  }
  return { text: joined, userTurnCount };
}

function listAdHocNotes() {
  const notes = [];
  const collect = (dir, scope) => {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.md')) continue;
      const full = path.join(dir, f);
      try {
        notes.push({ scope, file: full, content: fs.readFileSync(full, 'utf8').trim() });
      } catch {
        // skip
      }
    }
  };
  collect(path.join(GLOBAL_DIR, 'ad_hoc_notes'), 'global');
  if (fs.existsSync(PROJECTS_DIR)) {
    for (const ent of fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        collect(path.join(PROJECTS_DIR, ent.name, 'ad_hoc_notes'), ent.name);
      }
    }
  }
  return notes;
}

function parseFlags(argv) {
  const flags = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const idx = arg.indexOf('=');
      if (idx === -1) {
        flags[arg.slice(2)] = true;
      } else {
        flags[arg.slice(2, idx)] = arg.slice(idx + 1);
      }
    }
  }
  return flags;
}

function cmdScan(argv) {
  ensureBaseLayout();
  const flags = parseFlags(argv);
  const idleSeconds = Number(flags['idle-seconds'] ?? 120);
  const limit = Number(flags.limit ?? 8);
  const excludeConvId = flags['exclude-conversation'] || '';

  if (flags['acquire-lock']) {
    acquireLock('pipeline-scan');
  }

  const state = loadState();
  const queue = loadQueue();
  const now = Date.now();

  // Merge queue (priority) + full brain scan (crash-recovery fallback)
  const candidates = new Map();
  for (const [id, item] of Object.entries(queue.items)) {
    candidates.set(id, {
      conversation_id: id,
      namespace: item.namespace || '',
      transcript_path: item.transcript_path,
      from_queue: true
    });
  }
  for (const item of listBrainTranscripts()) {
    if (!candidates.has(item.conversation_id)) {
      candidates.set(item.conversation_id, {
        conversation_id: item.conversation_id,
        namespace: '',
        transcript_path: item.transcript_path,
        from_queue: false
      });
    }
  }

  // Sort: queued first, then most recently modified
  const enriched = [];
  for (const c of candidates.values()) {
    if (c.conversation_id === excludeConvId) continue;
    if (state.ignored[c.conversation_id]) continue;
    if (!c.transcript_path || !fs.existsSync(c.transcript_path)) continue;
    let stat;
    try {
      stat = fs.statSync(c.transcript_path);
    } catch {
      continue;
    }
    if (idleSeconds > 0 && now - stat.mtimeMs < idleSeconds * 1000) continue;
    enriched.push({ ...c, mtime_ms: stat.mtimeMs });
  }
  enriched.sort((a, b) => Number(b.from_queue) - Number(a.from_queue) || b.mtime_ms - a.mtime_ms);

  const tasks = [];
  let stateDirty = false;

  for (const item of enriched) {
    if (tasks.length >= limit) break;
    let raw;
    try {
      raw = fs.readFileSync(item.transcript_path, 'utf8');
    } catch {
      continue;
    }
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;

    // Detect and permanently ignore memory-consolidation self sessions
    const headSample = lines.slice(0, 5).join('\n');
    if (headSample.includes(CONSOLIDATION_MARKER)) {
      state.ignored[item.conversation_id] = true;
      delete queue.items[item.conversation_id];
      stateDirty = true;
      continue;
    }

    const prev = state.conversations[item.conversation_id];
    const fromLine = prev ? (prev.last_line || 0) : 0;
    if (lines.length <= fromLine) {
      if (queue.items[item.conversation_id]) {
        delete queue.items[item.conversation_id];
        stateDirty = true;
      }
      continue;
    }

    const { text: deltaText, userTurnCount } = renderDelta(lines, fromLine);
    if (!deltaText || userTurnCount === 0) {
      // Advance watermark for empty/system-only delta
      state.conversations[item.conversation_id] = {
        ...(prev || {}),
        namespace: item.namespace || prev?.namespace || 'global',
        last_line: lines.length,
        last_mtime_ms: item.mtime_ms,
        updated_at: new Date().toISOString()
      };
      delete queue.items[item.conversation_id];
      stateDirty = true;
      continue;
    }

    const ns = item.namespace || prev?.namespace || inferNamespaceFromLines(lines);
    const existingPath = prev?.summary_file || '';
    const existingContent = existingPath ? readTextIfExists(existingPath) : '';
    const dateStr = new Date(item.mtime_ms).toISOString().slice(0, 10);

    tasks.push({
      conversation_id: item.conversation_id,
      namespace: ns,
      date: dateStr,
      from_line: fromLine,
      to_line: lines.length,
      mtime_ms: item.mtime_ms,
      is_incremental: Boolean(existingContent),
      existing_summary_path: existingPath || null,
      existing_summary_content: existingContent || null,
      target_rollout_dir: path.join(PROJECTS_DIR, ns, 'rollout_summaries'),
      delta_text: deltaText
    });
  }

  if (stateDirty) {
    writeJsonAtomic(STATE_FILE, state);
    writeJsonAtomic(QUEUE_FILE, queue);
  }

  const adHocNotes = listAdHocNotes();
  process.stdout.write(JSON.stringify({
    memories_root: MEMORIES_DIR,
    pending_count: tasks.length,
    tasks,
    ad_hoc_notes: adHocNotes
  }, null, 2));
}

function cmdCommit(argv) {
  ensureBaseLayout();
  const flags = parseFlags(argv);
  const convId = flags['conversation-id'];
  if (!convId) {
    console.error('Missing --conversation-id');
    process.exit(1);
  }
  const state = loadState();
  const queue = loadQueue();
  const prev = state.conversations[convId] || {};

  state.conversations[convId] = {
    namespace: flags.namespace || prev.namespace || 'global',
    summary_file: flags['summary-file'] || prev.summary_file || '',
    last_line: Number(flags['last-line'] ?? prev.last_line ?? 0),
    last_mtime_ms: Number(flags['mtime-ms'] ?? prev.last_mtime_ms ?? Date.now()),
    skipped: Boolean(flags.skipped),
    updated_at: new Date().toISOString()
  };

  delete queue.items[convId];
  writeJsonAtomic(STATE_FILE, state);
  writeJsonAtomic(QUEUE_FILE, queue);
  process.stdout.write(JSON.stringify({ ok: true, conversation_id: convId }));
}

function cmdFinishRun() {
  ensureBaseLayout();
  const state = loadState();
  state.last_successful_run_at = new Date().toISOString();
  writeJsonAtomic(STATE_FILE, state);
  releaseLock();
  process.stdout.write(JSON.stringify({ ok: true, last_successful_run_at: state.last_successful_run_at }));
}

const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case 'session-start':
    await cmdSessionStart();
    break;
  case 'enqueue':
    await cmdEnqueue();
    break;
  case 'scan':
    cmdScan(rest);
    break;
  case 'commit':
    cmdCommit(rest);
    break;
  case 'finish-run':
    cmdFinishRun();
    break;
  default:
    console.error('Usage: memory-engine.mjs <session-start|enqueue|scan|commit|finish-run>');
    process.exit(1);
}
