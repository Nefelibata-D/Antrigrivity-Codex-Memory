import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
} from '@modelcontextprotocol/ext-apps';

const app = new App({ name: 'Memory', version: '1.0.0' }, {});

let currentView = 'overview';
let currentScope = 'global';
let summaryMode = 'preview';
let heatmapMode = 'rollouts';
let openDropdown = null; // 'scope' | 'model' | 'time' | null
let cfgModelValue = 'gemini-4-hydrogen-medium';
let cfgTimeValue = '23:30';
let overview = null;
let scopeDetail = null;
let selectedRolloutFile = '';
let toastTimer = null;

const MODEL_OPTIONS = [
  ['gemini-4-hydrogen-medium', 'Gemini 4 Hydrogen (Medium)'],
  ['gemini-4-neon-low', 'Gemini 4 Neon (Low)'],
  ['gemini-4-neon-medium', 'Gemini 4 Neon (Medium)'],
  ['gemini-4-neon-high', 'Gemini 4 Neon (High)'],
];

const $ = (id) => document.getElementById(id);

const SCOPE_TONES = ['blue', 'emerald', 'violet', 'amber', 'cyan'];

function getScopeTone(name) {
  if (name === 'global') return 'violet';
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return SCOPE_TONES[hash % SCOPE_TONES.length];
}

function showToast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderMarkdown(md) {
  const src = String(md || '').trim();
  if (!src) return '<div class="empty">当前空间暂无内容</div>';
  const lines = src.split(/\r?\n/);
  const out = [];
  let inList = false;

  const fmtInline = (line) =>
    escapeHtml(line)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      if (inList) { out.push('</ul>'); inList = false; }
      continue;
    }
    const h3 = line.match(/^###\s+(.+)/);
    const h2 = line.match(/^##\s+(.+)/);
    const h1 = line.match(/^#\s+(.+)/);
    const li = line.match(/^\s*[-*]\s+(.+)/);

    if (h1 || h2 || h3) {
      if (inList) { out.push('</ul>'); inList = false; }
      if (h1) out.push(`<h1>${fmtInline(h1[1])}</h1>`);
      else if (h2) out.push(`<h2>${fmtInline(h2[1])}</h2>`);
      else out.push(`<h3>${fmtInline(h3[1])}</h3>`);
    } else if (li) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${fmtInline(li[1])}</li>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      out.push(`<p>${fmtInline(line)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('');
}

function fmtTime(iso) {
  if (!iso) return '尚未运行';
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

async function callServer(name, args = {}) {
  const res = await app.callServerTool({ name, arguments: args });
  if (res?.isError) {
    throw new Error(res.content?.[0]?.text || '操作失败');
  }
  return res?.structuredContent;
}

function getAvailableScopesForView(view) {
  const all = overview?.scopes || [];
  if (view === 'rollouts') {
    return all.filter((s) => s.name !== 'global');
  }
  return all;
}

function closeAllDropdowns() {
  openDropdown = null;
  for (const [popId, btnId] of [
    ['scopePopover', 'scopeTrigger'],
    ['modelPopover', 'modelTrigger'],
    ['timePopover', 'timeTrigger'],
  ]) {
    const pop = $(popId);
    const btn = $(btnId);
    if (pop) pop.hidden = true;
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
}

function toggleDropdown(key, popId, btnId) {
  const willOpen = openDropdown !== key;
  closeAllDropdowns();
  if (willOpen) {
    openDropdown = key;
    $(popId).hidden = false;
    $(btnId).setAttribute('aria-expanded', 'true');
  }
}

function closeScopeDropdown() {
  closeAllDropdowns();
}

function renderScopeSelect() {
  if (!overview) return;
  const wrap = $('scopeSelectWrap');
  const label = $('scopeTriggerLabel');
  const dot = $('scopeTriggerDot');
  const pop = $('scopePopover');
  const scopes = getAvailableScopesForView(currentView);

  if (scopes.length > 0 && !scopes.some((s) => s.name === currentScope)) {
    currentScope = scopes[0].name;
  }

  wrap.hidden = currentView === 'overview' || currentView === 'settings' || scopes.length === 0;
  if (wrap.hidden) {
    closeScopeDropdown();
    return;
  }

  label.textContent = currentScope === 'global' ? 'Global' : currentScope;
  dot.dataset.tone = getScopeTone(currentScope);

  pop.innerHTML = '';
  for (const s of scopes) {
    const active = s.name === currentScope;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'dd-option';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', active ? 'true' : 'false');
    item.innerHTML = `
      <span class="dd-opt-left">
        <span class="dd-dot" data-tone="${getScopeTone(s.name)}"></span>
        <span>${escapeHtml(s.name === 'global' ? 'Global' : s.name)}</span>
      </span>
      ${active ? '<svg class="dd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
    `;
    item.onclick = async () => {
      closeScopeDropdown();
      if (s.name === currentScope) return;
      currentScope = s.name;
      selectedRolloutFile = '';
      renderScopeSelect();
      try {
        const detail = await callServer('memory_get_scope', { scope: currentScope });
        renderScope(detail);
      } catch (err) {
        showToast('加载失败：' + err.message);
      }
    };
    pop.appendChild(item);
  }
}

async function switchView(view) {
  currentView = view;
  for (const btn of $('mainTabs').querySelectorAll('.tab')) {
    btn.setAttribute('aria-selected', btn.dataset.view === view ? 'true' : 'false');
  }
  $('view-overview').hidden = view !== 'overview';
  $('view-summary').hidden = view !== 'summary';
  $('view-rollouts').hidden = view !== 'rollouts';
  $('view-notes').hidden = view !== 'notes';
  $('view-settings').hidden = view !== 'settings';

  const prevScope = currentScope;
  renderScopeSelect();

  if (view !== 'overview' && view !== 'settings' && currentScope && (currentScope !== prevScope || !scopeDetail || scopeDetail.scope !== currentScope)) {
    selectedRolloutFile = '';
    try {
      const detail = await callServer('memory_get_scope', { scope: currentScope });
      renderScope(detail);
    } catch (err) {
      showToast('加载失败：' + err.message);
    }
  }
}

function updateBudget(text, budget) {
  const bytes = new TextEncoder().encode(text || '').length;
  const pct = Math.min(100, Math.round((bytes / budget) * 100));
  const pill = $('budgetText');
  pill.textContent = `${fmtBytes(bytes)} / ${fmtBytes(budget)} (${pct}%)`;
  const tone = bytes > budget ? 'danger' : pct > 80 ? 'busy' : 'info';
  pill.dataset.tone = tone;

  const ring = $('budgetRingArc');
  if (ring) {
    const r = 6.5;
    const c = 2 * Math.PI * r;
    ring.style.strokeDasharray = `${c.toFixed(2)}`;
    ring.style.strokeDashoffset = `${(c * (1 - pct / 100)).toFixed(2)}`;
    ring.dataset.tone = tone;
  }
}

function updateRatioPreview() {
  const total = Math.max(3000, Math.min(32000, Number($('cfgMaxBytes').value) || 8900));
  const ratio = Math.max(10, Math.min(80, Number($('cfgGlobalRatio').value) || 33));
  const gBytes = Math.round(total * (ratio / 100));
  const pBytes = Math.max(1000, total - gBytes);
  $('cfgRatioVal').textContent = `Global ${ratio}% (${fmtBytes(gBytes)}) / Project ${100 - ratio}% (${fmtBytes(pBytes)})`;
  const pctEl = $('cfgRatioPct');
  if (pctEl) pctEl.textContent = `${ratio}%`;
  const slider = $('cfgGlobalRatio');
  if (slider) {
    const pct = ((ratio - 10) / (80 - 10)) * 100;
    slider.style.setProperty('--pct', `${pct.toFixed(1)}%`);
  }
}

function renderModelDropdown() {
  const label = $('modelTriggerLabel');
  const pop = $('modelPopover');
  if (!label || !pop) return;
  const matched = MODEL_OPTIONS.find(([val]) => val === cfgModelValue);
  label.textContent = matched ? matched[1] : cfgModelValue;
  pop.innerHTML = '';
  for (const [val, name] of MODEL_OPTIONS) {
    const active = val === cfgModelValue;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'dd-option';
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', active ? 'true' : 'false');
    item.innerHTML = `
      <span>${escapeHtml(name)}</span>
      ${active ? '<svg class="dd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
    `;
    item.onclick = () => {
      cfgModelValue = val;
      renderModelDropdown();
      closeAllDropdowns();
    };
    pop.appendChild(item);
  }
}

function renderTimeDropdown() {
  const label = $('timeTriggerLabel');
  const hCol = $('timeHours');
  const mCol = $('timeMinutes');
  if (!label || !hCol || !mCol) return;
  const [curH, curM] = (cfgTimeValue || '23:30').split(':');
  label.textContent = `${curH || '23'}:${curM || '30'}`;

  hCol.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const hh = String(h).padStart(2, '0');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dd-option time-opt';
    btn.setAttribute('aria-selected', hh === curH ? 'true' : 'false');
    btn.textContent = hh;
    btn.onclick = () => {
      cfgTimeValue = `${hh}:${curM || '30'}`;
      renderTimeDropdown();
    };
    hCol.appendChild(btn);
  }

  mCol.innerHTML = '';
  for (const mm of ['00', '10', '15', '20', '30', '40', '45', '50']) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dd-option time-opt';
    btn.setAttribute('aria-selected', mm === curM ? 'true' : 'false');
    btn.textContent = mm;
    btn.onclick = () => {
      cfgTimeValue = `${curH || '23'}:${mm}`;
      renderTimeDropdown();
      closeAllDropdowns();
    };
    mCol.appendChild(btn);
  }
}

function renderSettings(data) {
  const mcp = data.supermemory_mcp || {};
  const cfg = data.config || {};
  const badge = $('smStatusPill');
  const detail = $('smStatusDetail');
  if (badge && detail) {
    if (mcp.connected) {
      badge.dataset.tone = 'ok';
      badge.innerHTML = `<span class="dot"></span>已连接 (${mcp.schema_count} 工具)`;
      detail.textContent = `${mcp.transport === 'remote' ? 'Remote MCP' : 'Stdio MCP'} · ${mcp.endpoint || 'supermemory'}`;
    } else if (mcp.configured) {
      badge.dataset.tone = 'busy';
      badge.innerHTML = '<span class="dot"></span>已配置未激活';
      detail.textContent = `已在 mcp_config.json 中检测到，但尚未加载工具 Schema`;
    } else {
      badge.dataset.tone = 'danger';
      badge.innerHTML = '<span class="dot"></span>未检测到 MCP';
      detail.textContent = `未在 mcp_config.json 中找到 supermemory 配置`;
    }
  }
  $('cfgSmEnabled').checked = cfg.supermemory_enabled !== false;
  cfgTimeValue = cfg.schedule_time || '23:30';
  cfgModelValue = cfg.model || 'gemini-4-hydrogen-medium';
  renderTimeDropdown();
  renderModelDropdown();
  $('cfgMaxBytes').value = String(cfg.max_inject_bytes || 8900);
  $('cfgGlobalRatio').value = String(cfg.global_ratio || 33);
  updateRatioPreview();
}

function showHoverTip(e, text) {
  const tip = $('hoverTip');
  if (!tip || !text) return;
  tip.textContent = text;
  tip.classList.add('show');
  const pad = 12;
  const w = tip.offsetWidth || 160;
  const h = tip.offsetHeight || 28;
  let x = e.clientX + pad;
  let y = e.clientY - h - 10;
  if (x + w > window.innerWidth - 8) x = e.clientX - w - pad;
  if (y < 8) y = e.clientY + 14;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function hideHoverTip() {
  const tip = $('hoverTip');
  if (tip) tip.classList.remove('show');
}

function renderSpark(el, items, valueKey, formatVal) {
  if (!el) return;
  const arr = items.length >= 2 ? items : [{ date: '', label: '', [valueKey]: 0 }, ...items];
  const values = arr.map((d) => d[valueKey] || 0);
  const max = Math.max(1, ...values);
  const pts = arr.map((d, i) => ({
    x: (i / (arr.length - 1)) * 300,
    y: 34 - ((d[valueKey] || 0) / max) * 28,
    date: d.date || d.label || '',
    val: d[valueKey] || 0
  }));
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  el.innerHTML = `
    <svg viewBox="0 0 300 36" class="pt-spark" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="0,36 ${line} 300,36" fill="currentColor" opacity="0.09" />
      <polyline points="${line}" fill="none" stroke="currentColor" stroke-width="1.6" vector-effect="non-scaling-stroke" />
      <line class="spark-cursor" x1="0" y1="2" x2="0" y2="36" hidden />
      <circle class="spark-dot" cx="0" cy="0" r="3" hidden />
    </svg>
  `;
  const svg = el.querySelector('svg');
  const cursor = svg.querySelector('.spark-cursor');
  const dot = svg.querySelector('.spark-dot');
  svg.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const idx = Math.round(ratio * (pts.length - 1));
    const p = pts[idx];
    if (!p) return;
    cursor.setAttribute('x1', p.x.toFixed(1));
    cursor.setAttribute('x2', p.x.toFixed(1));
    cursor.removeAttribute('hidden');
    dot.setAttribute('cx', p.x.toFixed(1));
    dot.setAttribute('cy', p.y.toFixed(1));
    dot.removeAttribute('hidden');
    showHoverTip(e, `${p.date} · ${formatVal(p.val)}`);
  });
  svg.addEventListener('mouseleave', () => {
    cursor.setAttribute('hidden', '');
    dot.setAttribute('hidden', '');
    hideHoverTip();
  });
}

function renderHeatmap() {
  const grid = $('heatmapGrid');
  const axis = $('heatmapAxis');
  if (!grid || !axis || !overview) return;

  const map = overview.activity_by_date || {};
  const weeks = 53;
  const totalCells = weeks * 7;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDow = today.getDay(); // 0=Sun..6=Sat
  const start = new Date(today);
  start.setDate(today.getDate() - (totalCells - 1) - (6 - endDow));

  const cells = [];
  let maxVal = 0;
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const key = `${yyyy}-${mm}-${dd}`;
    const info = map[key] || { rollouts: 0, bytes: 0 };
    const val = heatmapMode === 'bytes' ? info.bytes : info.rollouts;
    if (val > maxVal) maxVal = val;
    cells.push({ key, label: `${mm}/${dd}`, rollouts: info.rollouts, bytes: info.bytes, val });
  }

  grid.innerHTML = cells.map((c) => {
    let style = '';
    if (c.val > 0 && maxVal > 0) {
      const ratio = c.val / maxVal;
      const pct = ratio > 0.75 ? 95 : ratio > 0.45 ? 72 : ratio > 0.2 ? 48 : 30;
      style = `style="background:color-mix(in srgb, var(--chart-1) ${pct}%, var(--subtle))"`;
    }
    const tip = `${c.key} · ${c.rollouts} 条记录 · ${fmtBytes(c.bytes)}`;
    return `<span class="pt-heat-cell" ${style} data-tip="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}"></span>`;
  }).join('');

  grid.onmousemove = (e) => {
    const cell = e.target.closest('.pt-heat-cell');
    if (cell?.dataset.tip) showHoverTip(e, cell.dataset.tip);
    else hideHoverTip();
  };
  grid.onmouseleave = () => hideHoverTip();

  const tickIndices = [0, 13 * 7, 26 * 7, 39 * 7, totalCells - 1];
  axis.innerHTML = tickIndices
    .map((idx) => `<span>${cells[Math.min(idx, cells.length - 1)]?.label || ''}</span>`)
    .join('');
}

function renderOverview(data) {
  overview = data;
  const scopes = data.scopes || [];
  const totalRollouts = scopes.reduce((a, s) => a + (s.rollout_count || 0), 0);
  const totalBytes = scopes.reduce((a, s) => a + (s.bytes || 0), 0);
  const totalBudget = scopes.reduce((a, s) => a + (s.budget || 0), 0);
  const usedPct = totalBudget > 0 ? Math.round((totalBytes / totalBudget) * 100) : 0;

  $('mTracked').textContent = String(data.tracked_conversations ?? 0);
  $('mTrackedSub').innerHTML = `<span class="kpi-dot" style="background:var(--success)"></span>${totalRollouts} Rollouts <span class="kpi-dot" style="background:var(--chart-1);margin-left:8px"></span>${scopes.length} 空间`;

  $('mTotalBytes').textContent = fmtBytes(totalBytes);
  $('mTotalBytesSub').innerHTML = `总预算 ${fmtBytes(totalBudget)} · 占用 <strong style="color:${usedPct > 80 ? 'var(--warning)' : 'var(--success)'}">${usedPct}%</strong>`;

  $('mQueue').textContent = String(data.queue_count ?? 0);
  $('mQueueSub').textContent = `上次整理 ${fmtTime(data.last_successful_run_at)}`;

  const trend = data.daily_trend || [];
  renderSpark($('sparkTracked'), trend, 'rollouts', (v) => `${v} 条记录`);
  renderSpark($('sparkBytes'), trend, 'bytes', (v) => fmtBytes(v));
  renderSpark($('sparkQueue'), trend.map((d) => ({ ...d, active: (d.rollouts || 0) > 0 ? 1 : 0 })), 'active', (v) => (v ? '有整理产出' : '无产出'));

  $('modelPill').textContent = data.model === 'gemini-4-hydrogen-medium' ? 'Gemini 4 Hydrogen (Medium)' : (data.model || '');

  const busy = Boolean(data.lock?.active);
  $('statusPill').dataset.tone = busy ? 'busy' : 'ok';
  $('statusText').textContent = busy ? '整理运行中…' : '运行正常';
  $('btnTrigger').disabled = busy;
  $('btnUnlock').hidden = !(data.lock?.active || data.lock?.stale);

  const names = scopes.map((s) => s.name);
  if (!names.includes(currentScope)) {
    currentScope = names.find((n) => n !== 'global') || 'global';
  }
  renderScopeSelect();
  renderHeatmap();
  renderSettings(data);
  if ($('overviewCapPill') && data.config?.max_inject_bytes) {
    $('overviewCapPill').textContent = `开场拼装上限 ${data.config.max_inject_bytes.toLocaleString()} B`;
  }

  // Scopes table
  const tbody = $('scopesTableBody');
  tbody.innerHTML = '';
  for (const s of data.scopes || []) {
    const pct = Math.min(100, Math.round((s.bytes / s.budget) * 100));
    const cls = s.bytes > s.budget ? 'over' : pct > 80 ? 'warn' : '';
    const tone = getScopeTone(s.name);
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td><span class="scope-tag" data-tone="${tone}"><span class="dot"></span>${escapeHtml(s.name === 'global' ? 'Global' : s.name)}</span></td>
      <td><div class="bar"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div></td>
      <td class="num">${fmtBytes(s.bytes)} / ${fmtBytes(s.budget)}</td>
      <td class="num">${s.rollout_count}</td>
      <td class="num">${s.note_count}</td>
    `;
    tr.onclick = async () => {
      currentScope = s.name;
      await switchView('summary');
      const detail = await callServer('memory_get_scope', { scope: currentScope });
      renderScope(detail);
    };
    tbody.appendChild(tr);
  }

  // Queue table
  const items = data.queue_items || [];
  const badge = $('queueBadge');
  badge.textContent = `${items.length} 条`;
  badge.dataset.tone = items.length > 0 ? 'busy' : 'ok';
  const qWrap = $('queueTableWrap');
  if (items.length === 0) {
    qWrap.innerHTML = '<div class="empty">当前没有待整理的新对话</div>';
  } else {
    qWrap.innerHTML = `
      <table class="queue-table">
        <colgroup>
          <col />
          <col style="width:190px" />
          <col style="width:120px" />
        </colgroup>
        <thead><tr><th>会话名称</th><th>空间</th><th class="num">登记时间</th></tr></thead>
        <tbody>
          ${items.map((it) => {
            const fullTitle = (it.title || it.conversation_id || '').trim();
            const tip = it.title && it.title !== it.conversation_id
              ? `${fullTitle}\nID: ${it.conversation_id}`
              : it.conversation_id;
            return `
            <tr>
              <td class="queue-title-cell"><span class="queue-title" title="${escapeHtml(tip)}">${escapeHtml(fullTitle)}</span></td>
              <td class="queue-scope-cell"><span class="scope-tag" data-tone="${getScopeTone(it.namespace || 'global')}"><span class="dot"></span>${escapeHtml(it.namespace || 'global')}</span></td>
              <td class="num queue-time-cell" style="color:var(--fg-muted)">${fmtTime(it.queued_at)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  }
}

function renderRolloutList() {
  const list = $('rolloutList');
  const query = ($('rolloutSearch').value || '').trim().toLowerCase();
  const rollouts = (scopeDetail?.rollouts || []).filter(
    (r) => !query || r.title.toLowerCase().includes(query) || (r.date || '').includes(query)
  );

  list.innerHTML = '';
  if (rollouts.length === 0) {
    list.innerHTML = '<div class="empty">暂无匹配的 Rollout 记录</div>';
    if (!selectedRolloutFile) {
      $('rolloutDetailBody').innerHTML = '<div class="empty">整理完成后，对话提炼历史将显示在这里</div>';
    }
    return;
  }

  for (const r of rollouts) {
    const row = document.createElement('div');
    row.className = 'rollout-row';
    row.dataset.file = r.file;
    row.dataset.active = r.file === selectedRolloutFile ? 'true' : 'false';
    const timeLabel = r.date || fmtTime(r.mtime);
    row.innerHTML = `
      <div style="min-width:0;flex:1">
        <div class="rollout-title">${escapeHtml(r.title)}</div>
        <div class="rollout-tags">
          <span class="mini-tag" data-tone="time">${escapeHtml(timeLabel)}</span>
          <span class="mini-tag" data-tone="size">${fmtBytes(r.bytes)}</span>
        </div>
      </div>
      <button type="button" class="row-del-btn" title="删除记录" aria-label="删除记录">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    `;
    row.onclick = () => selectRollout(r);
    row.querySelector('.row-del-btn').onclick = async (e) => {
      e.stopPropagation();
      try {
        await callServer('memory_delete_rollout', { scope: currentScope, file: r.file });
        if (selectedRolloutFile === r.file) selectedRolloutFile = '';
        showToast('已删除记录');
        await refreshAll();
      } catch (err) {
        showToast('删除失败：' + err.message);
      }
    };
    list.appendChild(row);
  }

  if (!selectedRolloutFile && rollouts.length > 0) {
    selectRollout(rollouts[0]);
  }
}

async function selectRollout(r) {
  selectedRolloutFile = r.file;
  for (const row of $('rolloutList').querySelectorAll('.rollout-row')) {
    row.dataset.active = row.dataset.file === r.file ? 'true' : 'false';
  }
  $('rolloutDetailBody').innerHTML = '<div class="empty">加载中…</div>';
  try {
    const res = await callServer('memory_read_rollout', { scope: currentScope, file: r.file });
    $('rolloutDetailBody').innerHTML = renderMarkdown(res?.content || '');
  } catch (err) {
    $('rolloutDetailBody').innerHTML = `<div class="empty">读取失败：${escapeHtml(err.message)}</div>`;
  }
}

function renderScope(detail) {
  if (!detail) return;
  scopeDetail = detail;
  currentScope = detail.scope || currentScope;
  renderScopeSelect();

  // Summary view
  $('summaryTitle').textContent = `${currentScope === 'global' ? 'Global' : currentScope} · memory_summary.md`;
  $('summaryEditor').value = detail.summary || '';
  $('summaryEditor').dataset.budget = String(detail.budget || 6000);
  $('summaryPreview').innerHTML = renderMarkdown(detail.summary);
  updateBudget(detail.summary, detail.budget || 6000);

  // Notes view
  const notes = detail.notes || [];
  $('notesCountPill').textContent = `${notes.length} 条待合并`;
  const nList = $('notesList');
  nList.innerHTML = '';
  if (notes.length === 0) {
    nList.innerHTML = '<div class="empty">暂无待合并便签</div>';
  } else {
    for (const n of notes) {
      const row = document.createElement('div');
      row.className = 'rollout-row';
      row.style.cursor = 'default';
      row.innerHTML = `
        <div style="min-width:0;flex:1">
          <div class="rollout-title">${escapeHtml(n.content)}</div>
          <div class="rollout-tags"><span class="mini-tag" data-tone="time">${fmtTime(n.mtime)}</span></div>
        </div>
        <button class="btn danger">删除</button>
      `;
      row.querySelector('button').onclick = async () => {
        try {
          await callServer('memory_delete_note', { scope: currentScope, file: n.file });
          showToast('已删除便签');
          const fresh = await callServer('memory_get_scope', { scope: currentScope });
          renderScope(fresh);
        } catch (err) {
          showToast('删除失败：' + err.message);
        }
      };
      nList.appendChild(row);
    }
  }

  // Rollouts view
  renderRolloutList();
}

async function refreshAll() {
  const ov = await callServer('memory_get_overview', {});
  renderOverview(ov);
  const detail = await callServer('memory_get_scope', { scope: currentScope });
  renderScope(detail);
}

function bindEvents() {
  for (const btn of $('mainTabs').querySelectorAll('.tab')) {
    btn.onclick = () => switchView(btn.dataset.view);
  }

  $('scopeTrigger').onclick = (e) => {
    e.stopPropagation();
    toggleDropdown('scope', 'scopePopover', 'scopeTrigger');
  };

  $('modelTrigger').onclick = (e) => {
    e.stopPropagation();
    toggleDropdown('model', 'modelPopover', 'modelTrigger');
  };

  $('timeTrigger').onclick = (e) => {
    e.stopPropagation();
    toggleDropdown('time', 'timePopover', 'timeTrigger');
  };

  document.addEventListener('click', (e) => {
    if (!openDropdown) return;
    const wraps = ['scopeSelectWrap', 'modelSelectWrap', 'timeSelectWrap'];
    if (!wraps.some((id) => $(id)?.contains(e.target))) {
      closeAllDropdowns();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openDropdown) closeAllDropdowns();
  });

  for (const btn of $('heatmapTabs').querySelectorAll('.tab')) {
    btn.onclick = () => {
      heatmapMode = btn.dataset.hmode;
      for (const b of $('heatmapTabs').querySelectorAll('.tab')) {
        b.setAttribute('aria-selected', b.dataset.hmode === heatmapMode ? 'true' : 'false');
      }
      renderHeatmap();
    };
  }

  for (const btn of $('modeTabs').querySelectorAll('.tab')) {
    btn.onclick = () => {
      summaryMode = btn.dataset.mode;
      for (const b of $('modeTabs').querySelectorAll('.tab')) {
        b.setAttribute('aria-selected', b.dataset.mode === summaryMode ? 'true' : 'false');
      }
      const isEdit = summaryMode === 'edit';
      $('summaryPreview').hidden = isEdit;
      $('summaryEditor').hidden = !isEdit;
      $('btnSaveSummary').hidden = !isEdit;
    };
  }

  $('summaryEditor').addEventListener('input', () => {
    updateBudget($('summaryEditor').value, Number($('summaryEditor').dataset.budget || 6000));
  });

  $('btnSaveSummary').onclick = async () => {
    try {
      const content = $('summaryEditor').value;
      await callServer('memory_save_summary', { scope: currentScope, content });
      $('summaryPreview').innerHTML = renderMarkdown(content);
      showToast('已保存 memory_summary.md');
      await refreshAll();
    } catch (err) {
      showToast('保存失败：' + err.message);
    }
  };

  for (const chip of document.querySelectorAll('.chip[data-prefix]')) {
    chip.onclick = () => {
      const input = $('noteInput');
      if (!input.value.startsWith(chip.dataset.prefix)) {
        input.value = chip.dataset.prefix + input.value;
      }
      input.focus();
    };
  }

  $('btnAddNote').onclick = async () => {
    const text = $('noteInput').value.trim();
    if (!text) return;
    try {
      await callServer('memory_add_note', { scope: currentScope, content: text });
      $('noteInput').value = '';
      showToast('已添加便签');
      await refreshAll();
    } catch (err) {
      showToast('添加失败：' + err.message);
    }
  };

  $('noteInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('btnAddNote').click();
  });

  $('rolloutSearch').addEventListener('input', () => renderRolloutList());

  $('cfgMaxBytes').addEventListener('input', updateRatioPreview);
  $('cfgGlobalRatio').addEventListener('input', updateRatioPreview);

  $('btnBytesDec').onclick = () => {
    const cur = Number($('cfgMaxBytes').value) || 8900;
    $('cfgMaxBytes').value = String(Math.max(3000, cur - 500));
    updateRatioPreview();
  };
  $('btnBytesInc').onclick = () => {
    const cur = Number($('cfgMaxBytes').value) || 8900;
    $('cfgMaxBytes').value = String(Math.min(32000, cur + 500));
    updateRatioPreview();
  };

  $('btnSaveConfig').onclick = async () => {
    try {
      await callServer('memory_save_config', {
        supermemory_enabled: $('cfgSmEnabled').checked,
        schedule_time: cfgTimeValue || '23:30',
        model: cfgModelValue || 'gemini-4-hydrogen-medium',
        max_inject_bytes: Number($('cfgMaxBytes').value) || 8900,
        global_ratio: Number($('cfgGlobalRatio').value) || 33
      });
      showToast('设置已保存');
      await refreshAll();
    } catch (err) {
      showToast('保存失败：' + err.message);
    }
  };

  $('btnTrigger').onclick = async () => {
    try {
      const res = await callServer('memory_trigger_consolidation', {});
      showToast(res?.started ? '已启动后台整理（Gemini 4 Hydrogen Medium）' : (res?.reason || '未触发'));
      await refreshAll();
    } catch (err) {
      showToast('触发失败：' + err.message);
    }
  };

  $('btnUnlock').onclick = async () => {
    try {
      await callServer('memory_unlock', {});
      showToast('已释放锁');
      await refreshAll();
    } catch (err) {
      showToast('释放失败：' + err.message);
    }
  };

  $('btnRefresh').onclick = async () => {
    try {
      await refreshAll();
      showToast('数据已刷新');
    } catch (err) {
      showToast('刷新失败：' + err.message);
    }
  };

  $('btnHotReload').onclick = async () => {
    try {
      const res = await callServer('memory_reload_ui', {});
      if (!res?.html) throw new Error('未获取到最新界面 HTML');
      document.open();
      document.write(res.html);
      document.close();
    } catch (err) {
      showToast('热重载失败：' + err.message);
    }
  };

  let latestUpdateTag = '';

  $('btnCheckUpdate').onclick = async () => {
    const btn = $('btnCheckUpdate');
    const pill = $('updStatusPill');
    const detail = $('updDetail');
    const banner = $('updateBanner');
    const applyBtn = $('btnApplyUpdate');
    btn.disabled = true;
    btn.textContent = '检查中...';
    try {
      const info = await callServer('memory_check_update', {});
      if (info?.error) {
        pill.dataset.tone = 'busy';
        pill.textContent = `当前 v${info.current_version}`;
        detail.textContent = `检查失败：${info.error}`;
        banner.hidden = true;
        applyBtn.hidden = true;
      } else if (info?.has_update) {
        latestUpdateTag = info.latest_tag;
        pill.dataset.tone = 'ok';
        pill.textContent = `发现新版本 ${info.latest_tag}`;
        detail.textContent = `当前版本 v${info.current_version}，可一键更新至 ${info.latest_tag}`;
        $('updNewTagPill').textContent = info.latest_tag;
        $('updReleaseName').textContent = info.release_name || info.latest_tag;
        $('updReleaseNotes').textContent = info.release_notes || '暂无更新说明';
        banner.hidden = false;
        applyBtn.hidden = false;
        showToast(`发现新版本 ${info.latest_tag}`);
      } else {
        pill.dataset.tone = 'ok';
        pill.textContent = `已是最新 v${info.current_version}`;
        detail.textContent = `上次检查：${fmtTime(info.checked_at)}`;
        banner.hidden = true;
        applyBtn.hidden = true;
        showToast('当前已是最新版本');
      }
    } catch (err) {
      showToast('检查更新失败：' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '检查更新';
    }
  };

  $('btnApplyUpdate').onclick = async () => {
    const btn = $('btnApplyUpdate');
    btn.disabled = true;
    btn.textContent = '更新中...';
    try {
      const res = await callServer('memory_apply_update', { tag: latestUpdateTag });
      showToast(res?.message || '更新完成，请点击热重载');
      $('updStatusPill').dataset.tone = 'ok';
      $('updStatusPill').textContent = `已更新至 ${res?.updated_to || latestUpdateTag}`;
      $('updDetail').textContent = '更新完成，点击顶部「热重载」即可立即生效';
      $('updateBanner').hidden = true;
      btn.hidden = true;
    } catch (err) {
      showToast('自动更新失败：' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '立即更新';
    }
  };
}

let hydrated = false;

app.ontoolresult = (result) => {
  const sc = result?.structuredContent;
  if (sc?.overview) {
    hydrated = true;
    renderOverview(sc.overview);
    if (sc.detail) renderScope(sc.detail);
  }
};

app.onhostcontextchanged = (ctx) => {
  if (ctx?.theme) applyDocumentTheme(ctx.theme);
  if (ctx?.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
};

async function init() {
  bindEvents();
  await app.connect();
  const ctx = app.getHostContext();
  if (ctx?.theme) applyDocumentTheme(ctx.theme);
  if (ctx?.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (!hydrated) {
    try {
      await refreshAll();
    } catch (err) {
      showToast('初始化加载失败：' + err.message);
    }
  }
}

init().catch((err) => showToast('连接失败：' + (err?.message || err)));
