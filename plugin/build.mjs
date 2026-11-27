import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const bundled = await esbuild.build({
  entryPoints: [path.join(__dirname, 'src', 'app.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: ['es2022']
});

const jsCode = bundled.outputFiles[0].text;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Memory</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: var(--color-background-primary, #111214);
      --card: var(--color-background-secondary, #17181c);
      --subtle: var(--color-background-tertiary, rgba(255, 255, 255, 0.06));
      --fg: var(--color-text-primary, #eceef2);
      --fg-muted: var(--color-text-secondary, #8f96a3);
      --border: var(--color-border-primary, rgba(255, 255, 255, 0.1));
      --border-soft: var(--color-border-secondary, rgba(255, 255, 255, 0.06));
      --accent: var(--color-ring-primary, #4f8cff);
      --success: var(--color-text-success, #22c55e);
      --warning: var(--color-text-warning, #f59e0b);
      --danger: var(--color-text-danger, #ef4444);
      --chart-1: #4f8cff;
      --chart-2: #22c55e;
      --chart-3: #a855f7;
      --chart-4: #f59e0b;
      --chart-5: #06b6d4;
      --font: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    * { box-sizing: border-box; }
    [hidden] { display: none !important; }

    /* Thin modern scrollbars */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb {
      background: color-mix(in srgb, var(--fg-muted) 26%, transparent);
      border-radius: 9999px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: color-mix(in srgb, var(--fg-muted) 48%, transparent);
    }

    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      overflow: hidden;
      background: var(--bg);
      color: var(--fg);
      font-family: var(--font);
      font-size: 13px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    .page {
      height: 100vh;
      overflow: hidden;
      padding: 14px 24px 16px;
      display: flex;
      flex-direction: column;
    }

    .shell {
      width: 100%;
      max-width: 960px;
      margin: 0 auto;
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    /* Header */
    .header {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      flex-wrap: wrap;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }

    .header h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.02em;
      line-height: 1.25;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 22px;
      padding: 0 9px;
      border-radius: 9999px;
      font-size: 11.5px;
      font-weight: 500;
      border: 1px solid var(--border);
      background: var(--subtle);
      color: var(--fg-muted);
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .pill[data-tone="ok"] {
      background: color-mix(in srgb, var(--success) 15%, transparent);
      border-color: color-mix(in srgb, var(--success) 34%, transparent);
      color: color-mix(in srgb, var(--success) 86%, var(--fg));
    }

    .pill[data-tone="busy"] {
      background: color-mix(in srgb, var(--warning) 16%, transparent);
      border-color: color-mix(in srgb, var(--warning) 36%, transparent);
      color: var(--warning);
    }

    .pill[data-tone="info"] {
      background: color-mix(in srgb, var(--chart-1) 14%, transparent);
      border-color: color-mix(in srgb, var(--chart-1) 32%, transparent);
      color: color-mix(in srgb, var(--chart-1) 82%, var(--fg));
    }

    .pill[data-tone="danger"] {
      background: color-mix(in srgb, var(--danger) 15%, transparent);
      border-color: color-mix(in srgb, var(--danger) 36%, transparent);
      color: var(--danger);
    }

    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      flex: none;
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* Segmented Tabs */
    .tabs {
      display: inline-flex;
      align-items: center;
      height: 32px;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 2px;
      gap: 2px;
      background: color-mix(in srgb, var(--subtle) 55%, transparent);
      user-select: none;
      max-width: 100%;
    }

    .tab {
      height: 100%;
      padding: 0 11px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--fg-muted);
      font: inherit;
      font-size: 12.5px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: background 120ms ease, color 120ms ease;
    }

    .tab:hover { color: var(--fg); }
    .tab[aria-selected="true"] {
      background: var(--card);
      color: var(--fg);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
    }

    /* Powertools-style custom dropdown */
    .dd-wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .dd-trigger {
      height: 32px;
      border: 1px solid var(--border);
      border-radius: 9999px;
      background: color-mix(in srgb, var(--subtle) 75%, var(--card));
      color: var(--fg);
      padding: 0 12px;
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font: inherit;
      font-size: 12.5px;
      font-weight: 500;
      cursor: pointer;
      min-width: 124px;
      outline: none;
      transition: background 120ms ease, border-color 120ms ease;
    }
    .dd-trigger:hover { background: var(--subtle); }
    .dd-trigger:focus-visible { border-color: var(--accent); }
    .dd-trigger svg { width: 14px; height: 14px; color: var(--fg-muted); flex: none; }
    .dd-popover {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      min-width: 176px;
      max-height: 260px;
      overflow-y: auto;
      padding: 4px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--card);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.42);
      z-index: 40;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .dd-option {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      width: 100%;
      padding: 7px 10px;
      border: 0;
      border-radius: 7px;
      background: transparent;
      color: var(--fg);
      font: inherit;
      font-size: 12.5px;
      text-align: left;
      cursor: pointer;
      transition: background 100ms ease;
    }
    .dd-option:hover { background: var(--subtle); }
    .dd-option[aria-selected="true"] {
      background: color-mix(in srgb, var(--chart-1) 14%, transparent);
      font-weight: 500;
    }
    .dd-opt-left { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
    .dd-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--chart-1); }
    .dd-dot[data-tone="blue"] { background: var(--chart-1); }
    .dd-dot[data-tone="emerald"] { background: var(--chart-2); }
    .dd-dot[data-tone="violet"] { background: var(--chart-3); }
    .dd-dot[data-tone="amber"] { background: var(--chart-4); }
    .dd-dot[data-tone="cyan"] { background: var(--chart-5); }
    .dd-check { width: 14px; height: 14px; color: var(--chart-1); flex: none; }

    /* Scope colored badges */
    .scope-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 22px;
      padding: 0 9px;
      border-radius: 9999px;
      font-size: 11.5px;
      font-weight: 600;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .scope-tag[data-tone="blue"] {
      background: color-mix(in srgb, var(--chart-1) 14%, transparent);
      border-color: color-mix(in srgb, var(--chart-1) 30%, transparent);
      color: color-mix(in srgb, var(--chart-1) 84%, var(--fg));
    }
    .scope-tag[data-tone="emerald"] {
      background: color-mix(in srgb, var(--chart-2) 14%, transparent);
      border-color: color-mix(in srgb, var(--chart-2) 30%, transparent);
      color: color-mix(in srgb, var(--chart-2) 84%, var(--fg));
    }
    .scope-tag[data-tone="violet"] {
      background: color-mix(in srgb, var(--chart-3) 14%, transparent);
      border-color: color-mix(in srgb, var(--chart-3) 30%, transparent);
      color: color-mix(in srgb, var(--chart-3) 84%, var(--fg));
    }
    .scope-tag[data-tone="amber"] {
      background: color-mix(in srgb, var(--chart-4) 15%, transparent);
      border-color: color-mix(in srgb, var(--chart-4) 32%, transparent);
      color: var(--chart-4);
    }
    .scope-tag[data-tone="cyan"] {
      background: color-mix(in srgb, var(--chart-5) 14%, transparent);
      border-color: color-mix(in srgb, var(--chart-5) 30%, transparent);
      color: color-mix(in srgb, var(--chart-5) 84%, var(--fg));
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      height: 32px;
      padding: 0 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--fg);
      font: inherit;
      font-size: 12.5px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: background 120ms ease, border-color 120ms ease, opacity 120ms ease;
    }

    .btn:hover:not(:disabled) { background: var(--subtle); }
    .btn:disabled { opacity: 0.45; cursor: default; }

    .btn.primary {
      background: var(--fg);
      color: var(--bg);
      border-color: transparent;
    }
    .btn.primary:hover:not(:disabled) {
      opacity: 0.88;
      background: var(--fg);
    }

    .btn.danger {
      border-color: transparent;
      background: transparent;
      color: var(--fg-muted);
      height: 26px;
      padding: 0 8px;
      font-size: 12px;
    }
    .btn.danger:hover {
      background: color-mix(in srgb, var(--danger) 14%, transparent);
      color: var(--danger);
    }
    .btn svg { width: 14px; height: 14px; flex: none; }

    /* Views container (internal scroll) */
    .view-scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding-right: 10px;
      padding-bottom: 12px;
    }
    .view-scroll > * {
      flex-shrink: 0;
    }

    .view-card {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    /* Cards */
    .card {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--card);
      overflow: hidden;
      min-width: 0;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14);
    }

    .card-head {
      flex: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-soft);
      flex-wrap: wrap;
    }

    .card-head h2 {
      margin: 0;
      font-size: 13.5px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }

    .card-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 0;
    }

    .card-body.scroll {
      flex: 1;
      overflow-y: auto;
    }

    /* KPI Metrics (Powertools pt-metrics + pt-spark) */
    .metrics {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
      flex: none;
    }

    .metric-card {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--card);
      padding: 15px 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.14);
    }

    .metric-lbl {
      font-size: 12px;
      color: var(--fg-muted);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .metric-lbl svg { width: 15px; height: 15px; color: var(--fg-muted); opacity: 0.78; }

    .metric-val {
      font-size: 26px;
      line-height: 1.2;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }

    .kpi-sub {
      font-size: 12px;
      color: var(--fg-muted);
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 4px;
      font-variant-numeric: tabular-nums;
    }
    .kpi-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      margin-right: 2px;
    }

    .spark-host { margin-top: 6px; }
    .pt-spark {
      width: 100%;
      height: 32px;
      display: block;
      color: var(--chart-1);
      cursor: crosshair;
    }
    .spark-cursor {
      stroke: color-mix(in srgb, var(--chart-1) 45%, transparent);
      stroke-width: 1;
      stroke-dasharray: 2 2;
      vector-effect: non-scaling-stroke;
    }
    .spark-dot {
      fill: var(--card);
      stroke: var(--chart-1);
      stroke-width: 2;
      vector-effect: non-scaling-stroke;
    }

    /* Powertools Usage Heatmap */
    .pt-heat {
      padding: 12px 16px 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      overflow-x: auto;
    }
    .pt-heat-grid {
      display: grid;
      gap: 4px;
      grid-template-rows: repeat(7, 1fr);
      grid-auto-flow: column;
      grid-auto-columns: minmax(7px, 1fr);
      min-width: 430px;
      aspect-ratio: 53 / 7;
      width: 100%;
    }
    .pt-heat-cell {
      border-radius: 3px;
      min-width: 0;
      min-height: 7px;
      background: var(--subtle);
      transition: transform 80ms ease, box-shadow 80ms ease;
      cursor: pointer;
    }
    .pt-heat-cell:hover {
      transform: scale(1.22);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--fg) 45%, transparent);
      position: relative;
      z-index: 2;
    }

    /* Custom floating tooltip */
    .hover-tip {
      position: fixed;
      left: 0;
      top: 0;
      padding: 5px 9px;
      border-radius: 7px;
      border: 1px solid var(--border);
      background: color-mix(in srgb, var(--card) 96%, #000);
      color: var(--fg);
      font-size: 11.5px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      box-shadow: 0 8px 20px rgba(0, 0, 0, 0.38);
      pointer-events: none;
      opacity: 0;
      transition: opacity 90ms ease;
      z-index: 60;
    }
    .hover-tip.show { opacity: 1; }
    .pt-heat-axis {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-width: 430px;
      font-size: 10px;
      color: var(--fg-muted);
      font-variant-numeric: tabular-nums;
    }

    /* Bars */
    .bar {
      width: 100%;
      height: 6px;
      border-radius: 9999px;
      background: var(--subtle);
      overflow: hidden;
      flex: none;
    }

    .bar-fill {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, var(--chart-1), var(--chart-5));
      transition: width 180ms ease;
    }

    .bar-fill.warn { background: linear-gradient(90deg, var(--chart-4), #fb923c); }
    .bar-fill.over { background: linear-gradient(90deg, var(--danger), #f97316); }

    /* Table */
    .table-wrap { width: 100%; overflow-x: auto; }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 12.5px;
      font-variant-numeric: tabular-nums;
    }
    th {
      font-size: 11.5px;
      font-weight: 500;
      color: var(--fg-muted);
      padding: 9px 16px;
      border-bottom: 1px solid var(--border-soft);
      white-space: nowrap;
    }
    td {
      padding: 10px 16px;
      border-bottom: 1px solid var(--border-soft);
      vertical-align: middle;
    }
    tr:last-child td { border-bottom: 0; }
    tbody tr:hover { background: color-mix(in srgb, var(--subtle) 55%, transparent); }
    .num { text-align: right; white-space: nowrap; }
    .queue-table { table-layout: fixed; }
    .queue-title-cell { overflow: hidden; }
    .queue-title {
      display: block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 12.5px;
      color: var(--fg);
    }
    .queue-scope-cell, .queue-time-cell { white-space: nowrap; }

    /* Search & Inputs */
    .search-box {
      height: 30px;
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 0 11px;
      border-radius: 9999px;
      border: 1px solid var(--border);
      background: var(--bg);
      min-width: 140px;
      flex: 1;
      max-width: 240px;
    }
    .search-box svg { width: 13px; height: 13px; color: var(--fg-muted); flex: none; }
    .search-box input {
      width: 100%;
      min-width: 0;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--fg);
      font: inherit;
      font-size: 12px;
    }

    .input-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: none;
    }

    input.text-input {
      flex: 1;
      min-width: 0;
      height: 36px;
      padding: 0 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--fg);
      font: inherit;
      font-size: 13px;
      outline: none;
      transition: border-color 120ms ease;
    }
    input.text-input:focus, textarea.editor:focus {
      border-color: var(--accent);
    }

    textarea.editor {
      flex: 1;
      width: 100%;
      min-height: 240px;
      padding: 14px 16px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--fg);
      font: 12.5px/1.65 var(--mono);
      resize: none;
      outline: none;
    }

    /* Rendered Markdown preview */
    .md-view {
      padding: 2px;
      font-size: 13px;
      line-height: 1.65;
      color: var(--fg);
    }
    .md-view h1, .md-view h2, .md-view h3 {
      margin: 14px 0 6px;
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .md-view h1:first-child, .md-view h2:first-child, .md-view h3:first-child { margin-top: 0; }
    .md-view h1 { font-size: 16px; }
    .md-view h2 {
      font-size: 14px;
      padding-bottom: 5px;
      border-bottom: 1px solid var(--border-soft);
      color: color-mix(in srgb, var(--chart-1) 50%, var(--fg));
    }
    .md-view h3 { font-size: 13px; color: color-mix(in srgb, var(--chart-5) 55%, var(--fg-muted)); }
    .md-view p { margin: 6px 0; }
    .md-view ul { margin: 6px 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
    .md-view code {
      font-family: var(--mono);
      font-size: 11.5px;
      padding: 1px 5px;
      border-radius: 4px;
      background: color-mix(in srgb, var(--chart-1) 10%, var(--subtle));
      color: color-mix(in srgb, var(--chart-1) 35%, var(--fg));
    }
    .md-view strong { font-weight: 600; }

    /* Split layout for Rollouts (independent internal scrolling) */
    .split {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
      gap: 14px;
      align-items: stretch;
    }

    .split > .card {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }

    .rollout-list {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    .rollout-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 11px 14px;
      border-bottom: 1px solid var(--border-soft);
      cursor: pointer;
      transition: background 120ms ease;
    }
    .rollout-row:last-child { border-bottom: 0; }
    .rollout-row:hover { background: color-mix(in srgb, var(--subtle) 55%, transparent); }
    .rollout-row[data-active="true"] {
      background: color-mix(in srgb, var(--chart-1) 12%, transparent);
      box-shadow: inset 2.5px 0 0 var(--chart-1);
    }
    .rollout-title { font-size: 12.5px; font-weight: 500; line-height: 1.4; word-break: break-word; }

    .rollout-tags {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 6px;
      flex-wrap: wrap;
    }

    .mini-tag {
      display: inline-flex;
      align-items: center;
      height: 19px;
      padding: 0 7px;
      border-radius: 5px;
      font-size: 11px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      border: 1px solid var(--border-soft);
      background: var(--subtle);
      color: var(--fg-muted);
    }
    .mini-tag[data-tone="time"] {
      background: color-mix(in srgb, var(--chart-1) 12%, transparent);
      border-color: color-mix(in srgb, var(--chart-1) 24%, transparent);
      color: color-mix(in srgb, var(--chart-1) 75%, var(--fg));
    }
    .mini-tag[data-tone="size"] {
      background: color-mix(in srgb, var(--chart-5) 12%, transparent);
      border-color: color-mix(in srgb, var(--chart-5) 24%, transparent);
      color: color-mix(in srgb, var(--chart-5) 75%, var(--fg));
    }

    .chip-row { display: flex; gap: 6px; flex-wrap: wrap; flex: none; }
    .chip {
      height: 24px;
      padding: 0 9px;
      border-radius: 9999px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--fg-muted);
      font: inherit;
      font-size: 11.5px;
      cursor: pointer;
    }
    .chip:hover { color: var(--fg); background: var(--subtle); }

    .notes-scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      border: 1px solid var(--border-soft);
      border-radius: 10px;
    }

    .empty {
      padding: 28px 16px;
      text-align: center;
      color: var(--fg-muted);
      font-size: 12.5px;
    }

    /* Ring progress indicator */
    .budget-wrap {
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }
    .budget-ring {
      width: 18px;
      height: 18px;
      transform: rotate(-90deg);
      flex: none;
    }
    .budget-ring-bg {
      fill: none;
      stroke: var(--subtle);
      stroke-width: 2.4;
    }
    .budget-ring-arc {
      fill: none;
      stroke: var(--chart-1);
      stroke-width: 2.4;
      stroke-linecap: round;
      transition: stroke-dashoffset 180ms ease, stroke 180ms ease;
    }
    .budget-ring-arc[data-tone="busy"] { stroke: var(--warning); }
    .budget-ring-arc[data-tone="danger"] { stroke: var(--danger); }

    /* Rollout row delete button */
    .row-del-btn {
      flex: none;
      width: 26px;
      height: 26px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--fg-muted);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      opacity: 0.45;
      transition: opacity 120ms ease, background 120ms ease, color 120ms ease;
    }
    .rollout-row:hover .row-del-btn { opacity: 1; }
    .row-del-btn:hover {
      background: color-mix(in srgb, var(--danger) 15%, transparent);
      color: var(--danger);
      opacity: 1;
    }
    .row-del-btn svg { width: 13px; height: 13px; }

    /* Settings form */
    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-soft);
      flex-wrap: wrap;
    }
    .setting-row:last-child { border-bottom: 0; }
    .setting-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .setting-title { font-size: 13px; font-weight: 500; color: var(--fg); }
    .setting-desc { font-size: 11.5px; color: var(--fg-muted); }
    .setting-ctrl { display: inline-flex; align-items: center; gap: 10px; }
    .cfg-input {
      height: 32px;
      padding: 0 10px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--fg);
      font: inherit;
      font-size: 12.5px;
      outline: none;
    }
    .cfg-input:focus { border-color: var(--accent); }
    .switch {
      position: relative;
      display: inline-block;
      width: 38px;
      height: 22px;
      flex: none;
    }
    .switch input { opacity: 0; width: 0; height: 0; }
    .switch-slider {
      position: absolute;
      inset: 0;
      border-radius: 9999px;
      background: var(--subtle);
      border: 1px solid var(--border);
      cursor: pointer;
      transition: background 150ms ease, border-color 150ms ease;
    }
    .switch-slider::before {
      content: '';
      position: absolute;
      width: 16px;
      height: 16px;
      left: 2px;
      top: 2px;
      border-radius: 50%;
      background: var(--fg);
      transition: transform 150ms ease;
    }
    .switch input:checked + .switch-slider {
      background: var(--chart-1);
      border-color: var(--chart-1);
    }
    .switch input:checked + .switch-slider::before {
      transform: translateX(16px);
    }
    .range-input { accent-color: var(--chart-1); width: 160px; cursor: pointer; }

    /* Custom Stepper Input (replaces native number input) */
    .num-stepper {
      display: inline-flex;
      align-items: center;
      height: 32px;
      border-radius: 9999px;
      border: 1px solid var(--border);
      background: color-mix(in srgb, var(--subtle) 75%, var(--card));
      padding: 2px;
      gap: 2px;
      transition: border-color 120ms ease, background 120ms ease;
    }
    .num-stepper:focus-within {
      border-color: var(--accent);
      background: var(--card);
    }
    .step-btn {
      width: 26px;
      height: 26px;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: var(--fg-muted);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      transition: background 120ms ease, color 120ms ease;
    }
    .step-btn:hover { background: var(--subtle); color: var(--fg); }
    .step-input {
      width: 68px;
      border: 0;
      outline: none;
      background: transparent;
      color: var(--fg);
      font: 500 12.5px/1 var(--mono);
      font-variant-numeric: tabular-nums;
      text-align: center;
      -moz-appearance: textfield;
    }
    .step-input::-webkit-outer-spin-button,
    .step-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .step-unit {
      font-size: 11px;
      color: var(--fg-muted);
      padding-right: 4px;
      user-select: none;
    }

    /* Custom Dual-Tone Range Slider */
    .slider-wrap {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }
    .slider-val {
      font-size: 11.5px;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      color: var(--fg-muted);
      min-width: 34px;
      text-align: right;
    }
    .custom-slider {
      -webkit-appearance: none;
      appearance: none;
      width: 176px;
      height: 6px;
      border-radius: 9999px;
      outline: none;
      cursor: pointer;
      background: linear-gradient(
        90deg,
        var(--chart-3) 0%,
        var(--chart-3) var(--pct, 33%),
        color-mix(in srgb, var(--chart-1) 35%, var(--subtle)) var(--pct, 33%),
        color-mix(in srgb, var(--chart-1) 35%, var(--subtle)) 100%
      );
      border: 1px solid var(--border-soft);
    }
    .custom-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--fg);
      border: 2.5px solid var(--chart-3);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease;
    }
    .custom-slider::-webkit-slider-thumb:hover {
      transform: scale(1.12);
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--chart-3) 22%, transparent);
    }
    .custom-slider::-moz-range-thumb {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: var(--fg);
      border: 2.5px solid var(--chart-3);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
      cursor: pointer;
    }
    .time-popover {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      min-width: 152px;
      padding: 6px;
    }
    .time-col {
      display: flex;
      flex-direction: column;
      gap: 2px;
      max-height: 200px;
      overflow-y: auto;
    }
    .time-col-head {
      font-size: 10.5px;
      color: var(--fg-muted);
      text-align: center;
      padding: 2px 0 4px;
      border-bottom: 1px solid var(--border-soft);
      margin-bottom: 2px;
    }
    .time-opt {
      justify-content: center;
      padding: 5px 8px;
      font-variant-numeric: tabular-nums;
    }
    .card.allow-overflow { overflow: visible; }

    /* Update banner (powertools style) */
    .update-banner {
      margin: 0 16px 14px;
      padding: 12px 14px;
      border-radius: 10px;
      border: 1px solid color-mix(in srgb, var(--chart-1) 34%, transparent);
      background: color-mix(in srgb, var(--chart-1) 10%, var(--bg));
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .update-banner-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
    }
    .update-banner-title {
      font-size: 12.5px;
      font-weight: 600;
      color: var(--fg);
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .update-notes {
      font-size: 12px;
      line-height: 1.55;
      color: var(--fg-muted);
      white-space: pre-wrap;
      max-height: 140px;
      overflow-y: auto;
      padding: 8px 10px;
      border-radius: 8px;
      background: color-mix(in srgb, var(--card) 75%, transparent);
      border: 1px solid var(--border-soft);
    }

    .toast-bar {
      position: fixed;
      right: 20px;
      bottom: 20px;
      padding: 8px 14px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--fg);
      font-size: 12.5px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
      opacity: 0;
      transform: translateY(8px);
      pointer-events: none;
      transition: opacity 160ms ease, transform 160ms ease;
      z-index: 50;
    }
    .toast-bar.show { opacity: 1; transform: translateY(0); }

    @media (max-width: 680px) {
      .page { padding: 14px 14px 16px; }
      .metrics { grid-template-columns: 1fr; }
      .split { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="shell">
      <header class="header">
        <div class="header-left">
          <h1>Memory</h1>
          <span class="pill" id="statusPill" data-tone="ok"><span class="dot"></span><span id="statusText">空闲</span></span>
          <span class="pill" id="modelPill" data-tone="info">Gemini 4 Hydrogen Medium</span>
        </div>
        <div class="toolbar">
          <button class="btn primary" id="btnTrigger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="6 4 20 12 6 20 6 4"/></svg>
            立即整理
          </button>
          <button class="btn" id="btnUnlock" hidden>释放锁</button>
          <button class="btn" id="btnRefresh" title="刷新数据">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><polyline points="21 3 21 9 15 9"/></svg>
            刷新
          </button>
          <button class="btn" id="btnHotReload" title="从磁盘热重载最新构建的界面">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            热重载
          </button>
        </div>
      </header>

      <div class="header">
        <div class="tabs" role="tablist" id="mainTabs">
          <button class="tab" role="tab" data-view="overview" aria-selected="true">概览</button>
          <button class="tab" role="tab" data-view="summary" aria-selected="false">热记忆</button>
          <button class="tab" role="tab" data-view="rollouts" aria-selected="false">历史记录</button>
          <button class="tab" role="tab" data-view="notes" aria-selected="false">快捷便签</button>
          <button class="tab" role="tab" data-view="settings" aria-selected="false">设置</button>
        </div>
        <div class="dd-wrap" id="scopeSelectWrap" hidden>
          <button type="button" class="dd-trigger" id="scopeTrigger" aria-haspopup="listbox" aria-expanded="false">
            <span class="dd-opt-left">
              <span class="dd-dot" id="scopeTriggerDot" data-tone="blue"></span>
              <span id="scopeTriggerLabel">cashbook</span>
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="dd-popover" id="scopePopover" role="listbox" hidden></div>
        </div>
      </div>

      <!-- VIEW 1: OVERVIEW -->
      <section id="view-overview" class="view-scroll">
        <div class="metrics">
          <div class="metric-card">
            <div class="metric-lbl">
              <span>已纳管会话</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div class="metric-val" id="mTracked">0</div>
            <div class="kpi-sub" id="mTrackedSub">0 Rollouts</div>
            <div class="spark-host" id="sparkTracked"></div>
          </div>
          <div class="metric-card">
            <div class="metric-lbl">
              <span>热记忆总量</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
            </div>
            <div class="metric-val" id="mTotalBytes">0 B</div>
            <div class="kpi-sub" id="mTotalBytesSub">占用 0%</div>
            <div class="spark-host" id="sparkBytes"></div>
          </div>
          <div class="metric-card">
            <div class="metric-lbl">
              <span>待整理队列</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div class="metric-val" id="mQueue">0</div>
            <div class="kpi-sub" id="mQueueSub">尚未运行</div>
            <div class="spark-host" id="sparkQueue"></div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h2>记忆活动热力图</h2>
            <div class="tabs" id="heatmapTabs">
              <button class="tab" data-hmode="rollouts" aria-selected="true">Rollouts</button>
              <button class="tab" data-hmode="bytes" aria-selected="false">字节数</button>
            </div>
          </div>
          <div class="pt-heat">
            <div class="pt-heat-grid" id="heatmapGrid"></div>
            <div class="pt-heat-axis" id="heatmapAxis"></div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h2>记忆空间容量</h2>
            <span class="pill" id="overviewCapPill">开场拼装上限 8,900 B</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>空间</th>
                  <th style="width:42%">热记忆占用</th>
                  <th class="num">字节 / 预算</th>
                  <th class="num">Rollouts</th>
                  <th class="num">待合并便签</th>
                </tr>
              </thead>
              <tbody id="scopesTableBody"></tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h2>待整理队列</h2>
            <span class="pill" id="queueBadge">0 条</span>
          </div>
          <div class="table-wrap" id="queueTableWrap"></div>
        </div>
      </section>

      <!-- VIEW 2: HOT MEMORY -->
      <section id="view-summary" class="card view-card" hidden>
        <div class="card-head">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <h2 id="summaryTitle">memory_summary.md</h2>
            <span class="budget-wrap">
              <svg class="budget-ring" viewBox="0 0 18 18" aria-hidden="true">
                <circle class="budget-ring-bg" cx="9" cy="9" r="6.5" />
                <circle class="budget-ring-arc" id="budgetRingArc" cx="9" cy="9" r="6.5" />
              </svg>
              <span class="pill" id="budgetText" data-tone="info">0 / 6000 B</span>
            </span>
          </div>
          <div class="toolbar">
            <div class="tabs" id="modeTabs">
              <button class="tab" data-mode="preview" aria-selected="true">预览</button>
              <button class="tab" data-mode="edit" aria-selected="false">编辑</button>
            </div>
            <button class="btn primary" id="btnSaveSummary" hidden>保存修改</button>
          </div>
        </div>
        <div class="card-body scroll">
          <div class="md-view" id="summaryPreview"></div>
          <textarea class="editor" id="summaryEditor" hidden placeholder="当前空间暂无 memory_summary.md..."></textarea>
        </div>
      </section>

      <!-- VIEW 3: ROLLOUTS -->
      <section id="view-rollouts" class="split" hidden>
        <div class="card">
          <div class="card-head">
            <h2>Rollouts</h2>
            <div class="search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input id="rolloutSearch" type="text" placeholder="搜索记录..." />
            </div>
          </div>
          <div class="rollout-list" id="rolloutList"></div>
        </div>

        <div class="card">
          <div class="card-body scroll">
            <div class="md-view" id="rolloutDetailBody"><div class="empty">点击左侧 Rollout 摘要即可阅读完整任务历史与关键路径</div></div>
          </div>
        </div>
      </section>

      <!-- VIEW 4: AD-HOC NOTES -->
      <section id="view-notes" class="card view-card" hidden>
        <div class="card-head">
          <h2>快捷便签 (ad_hoc_notes)</h2>
          <span class="pill" id="notesCountPill" data-tone="info">0 条待合并</span>
        </div>
        <div class="card-body" style="flex:1;min-height:0">
          <div class="chip-row">
            <button class="chip" data-prefix="记住：">+ 记住</button>
            <button class="chip" data-prefix="纠正：">+ 纠正</button>
            <button class="chip" data-prefix="忘记：">+ 忘记</button>
          </div>
          <div class="input-row">
            <input class="text-input" id="noteInput" type="text" placeholder="输入希望长期记住、纠正或删除的规则，下次整理将自动合并..." />
            <button class="btn primary" id="btnAddNote">添加便签</button>
          </div>
          <div id="notesList" class="notes-scroll"></div>
        </div>
      </section>

      <!-- VIEW 5: SETTINGS -->
      <section id="view-settings" class="view-scroll" hidden>
        <div class="card">
          <div class="card-head">
            <h2>Supermemory MCP 连接</h2>
            <span class="pill" id="smStatusPill" data-tone="ok"><span class="dot"></span>检测中</span>
          </div>
          <div class="setting-row">
            <div class="setting-meta">
              <span class="setting-title">启用 Supermemory 云端双写</span>
              <span class="setting-desc" id="smStatusDetail">正在检测本地 mcp_config.json...</span>
            </div>
            <label class="switch">
              <input type="checkbox" id="cfgSmEnabled" checked />
              <span class="switch-slider"></span>
            </label>
          </div>
        </div>

        <div class="card allow-overflow">
          <div class="card-head">
            <h2>自动整理策略</h2>
          </div>
          <div class="setting-row">
            <div class="setting-meta">
              <span class="setting-title">每日自动整理时间</span>
              <span class="setting-desc">漏跑时会在下次会话开场自动补触发 (Asia/Shanghai)</span>
            </div>
            <div class="dd-wrap" id="timeSelectWrap">
              <button type="button" class="dd-trigger" id="timeTrigger" aria-haspopup="listbox" aria-expanded="false" style="min-width:110px">
                <span class="dd-opt-left">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span id="timeTriggerLabel" style="font-variant-numeric:tabular-nums">23:30</span>
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div class="dd-popover time-popover" id="timePopover" hidden>
                <div>
                  <div class="time-col-head">时</div>
                  <div class="time-col" id="timeHours"></div>
                </div>
                <div>
                  <div class="time-col-head">分</div>
                  <div class="time-col" id="timeMinutes"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-meta">
              <span class="setting-title">整理模型</span>
              <span class="setting-desc">用于后台提炼 Rollout 与合并热记忆摘要</span>
            </div>
            <div class="dd-wrap" id="modelSelectWrap">
              <button type="button" class="dd-trigger" id="modelTrigger" aria-haspopup="listbox" aria-expanded="false" style="min-width:210px">
                <span id="modelTriggerLabel">Gemini 4 Hydrogen (Medium)</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div class="dd-popover" id="modelPopover" role="listbox" style="min-width:220px" hidden></div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h2>热记忆容量与比例</h2>
            <span class="pill" id="cfgRatioVal" data-tone="info">Global 33% / Project 67%</span>
          </div>
          <div class="setting-row">
            <div class="setting-meta">
              <span class="setting-title">开场拼装总上限 (Bytes)</span>
              <span class="setting-desc">SessionStart 注入时的 UTF-8 字节预算上限 (3,000 - 32,000)</span>
            </div>
            <div class="setting-ctrl">
              <div class="num-stepper">
                <button type="button" class="step-btn" id="btnBytesDec" aria-label="减少 500 字节">−</button>
                <input type="number" class="step-input" id="cfgMaxBytes" min="3000" max="32000" step="100" value="8900" />
                <span class="step-unit">B</span>
                <button type="button" class="step-btn" id="btnBytesInc" aria-label="增加 500 字节">+</button>
              </div>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-meta">
              <span class="setting-title">Global / Project 空间比例</span>
              <span class="setting-desc">拖动滑块调整全局记忆与单项目热记忆的预算分配</span>
            </div>
            <div class="setting-ctrl">
              <div class="slider-wrap">
                <span class="slider-val" id="cfgRatioPct">33%</span>
                <input type="range" class="custom-slider" id="cfgGlobalRatio" min="10" max="80" step="1" value="33" />
              </div>
            </div>
          </div>
          <div class="setting-row" style="justify-content:flex-end">
            <button type="button" class="btn primary" id="btnSaveConfig">保存设置</button>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h2>版本与自动更新</h2>
            <span class="pill" id="updStatusPill" data-tone="info">当前 v1.1.2</span>
          </div>
          <div class="setting-row">
            <div class="setting-meta">
              <span class="setting-title">Antigrivity Memory 插件</span>
              <span class="setting-desc" id="updDetail">从 GitHub Releases 检查最新版本并支持一键在线更新</span>
            </div>
            <div class="setting-ctrl">
              <button type="button" class="btn" id="btnCheckUpdate">检查更新</button>
              <button type="button" class="btn primary" id="btnApplyUpdate" hidden>立即更新</button>
            </div>
          </div>
          <div class="update-banner" id="updateBanner" hidden>
            <div class="update-banner-head">
              <span class="update-banner-title">
                <span class="pill" data-tone="ok" id="updNewTagPill">v1.1.0</span>
                <span id="updReleaseName">发现新版本</span>
              </span>
            </div>
            <div class="update-notes" id="updReleaseNotes"></div>
          </div>
        </div>
      </section>
    </div>
  </div>
  <div class="hover-tip" id="hoverTip"></div>
  <div class="toast-bar" id="toast"></div>
  <script>${jsCode}</script>
</body>
</html>
`;

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'dashboard.html'), html, 'utf8');
console.log(`Built dist/dashboard.html (${Buffer.byteLength(html, 'utf8')} bytes)`);
