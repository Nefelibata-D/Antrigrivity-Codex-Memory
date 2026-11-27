#!/usr/bin/env node
/**
 * Release helper for Antrigrivity-Codex-Memory.
 * Bumps version in plugin/plugin.json & plugin/package.json, commits,
 * creates an annotated git tag with detailed release notes, pushes, and publishes a GitHub Release.
 *
 * Usage:
 *   node release.mjs <version> "<release notes>"
 * Example:
 *   node release.mjs v1.1.0 "- 新增插件内检查更新与一键自动更新\n- 新增双语 README"
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawVer = (process.argv[2] || '').trim();
const rawNotes = (process.argv[3] || '').trim();

if (!rawVer || !/^v?\d+\.\d+\.\d+$/.test(rawVer)) {
  console.error('Usage: node release.mjs <vX.Y.Z> "<release notes>"');
  process.exit(1);
}
if (!rawNotes) {
  console.error('Error: 请提供具体的 Tag / Release 更新说明（便于用户检查更新时查看变更内容）。');
  process.exit(1);
}

const version = rawVer.replace(/^v/i, '');
const tag = `v${version}`;
const notes = rawNotes.replace(/\\n/g, '\n');

function updateJsonVersion(relPath) {
  const full = path.join(__dirname, relPath);
  const data = JSON.parse(fs.readFileSync(full, 'utf8'));
  data.version = version;
  fs.writeFileSync(full, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`Updated ${relPath} -> ${version}`);
}

updateJsonVersion('plugin/plugin.json');
updateJsonVersion('plugin/package.json');

// Update displayed version pill in build.mjs if present
const buildPath = path.join(__dirname, 'plugin/build.mjs');
const buildSrc = fs.readFileSync(buildPath, 'utf8').replace(
  /id="updStatusPill" data-tone="info">当前 v[0-9.]+</,
  `id="updStatusPill" data-tone="info">当前 ${tag}<`
);
fs.writeFileSync(buildPath, buildSrc, 'utf8');

execFileSync('git', ['add', 'plugin/plugin.json', 'plugin/package.json', 'plugin/build.mjs'], { cwd: __dirname, stdio: 'inherit' });
execFileSync('git', ['commit', '-m', `chore(release): ${tag}`], { cwd: __dirname, stdio: 'inherit' });
execFileSync('git', ['tag', '-a', tag, '-m', `${tag}\n\n${notes}`], { cwd: __dirname, stdio: 'inherit' });
execFileSync('git', ['push', 'origin', 'main', tag], { cwd: __dirname, stdio: 'inherit' });

try {
  execFileSync('gh', ['release', 'create', tag, '--title', tag, '--notes', notes], { cwd: __dirname, stdio: 'inherit' });
  console.log(`Published GitHub Release ${tag}!`);
} catch {
  console.log(`Tag ${tag} pushed. GitHub Actions will publish the Release automatically.`);
}
