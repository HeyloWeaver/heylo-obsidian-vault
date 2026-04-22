#!/usr/bin/env node
/**
 * Run AppSync resolvers locally (HTTP) without editing main.go.
 *
 * With -tags local, main_local.go provides main(), but main.go also defines
 * lambda main(). Go's -overlay swaps main.go for a generated copy that omits
 * func main() so the tree compiles.
 *
 * Usage (from repo root):
 *   node appsync-local-dev.mjs              # run once (no file watching)
 *   node appsync-local-dev.mjs --watch    # restart on .go saves under go/backend/appsync
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const candidateMain = join(SCRIPT_DIR, 'go', 'backend', 'appsync', 'main.go');
const ROOT = existsSync(candidateMain)
  ? SCRIPT_DIR
  : resolve(SCRIPT_DIR, '..');
const APPSYNC_DIR = join(ROOT, 'go', 'backend', 'appsync');
const MAIN_GO = join(APPSYNC_DIR, 'main.go');
const DEVGEN = join(APPSYNC_DIR, '.devgen');
const OVERLAY_MAIN = join(DEVGEN, 'main.overlay.go');
const OVERLAY_JSON = join(DEVGEN, 'overlay.json');

const watchMode = process.argv.includes('--watch');

/**
 * Remove the first top-level `func main(...) { ... }` from Go source.
 * Assumes conventional formatting (same as current main.go).
 */
function stripFirstFuncMain(src) {
  const m = /\bfunc\s+main\s*\(/.exec(src);
  if (!m) {
    throw new Error(`Expected to find func main( in ${MAIN_GO}`);
  }
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    i++;
  }
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] !== '{') {
    throw new Error('Expected { after func main(...) signature');
  }
  const bodyOpen = i;
  depth = 1;
  i = bodyOpen + 1;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  const before = src.slice(0, m.index).replace(/\n{3,}/g, '\n\n');
  const after = src.slice(i).replace(/^\n+/, '\n');
  return before + after;
}

/** After removing func main, lambda import is unused in the overlay copy. */
function dropUnusedLambdaImport(src) {
  if (/\blambda\./.test(src)) return src;
  return src.replace(
    /\n[\t ]*"github\.com\/aws\/aws-lambda-go\/lambda"\s*\n/,
    '\n',
  );
}

function writeOverlayFiles() {
  mkdirSync(DEVGEN, { recursive: true });
  const original = readFileSync(MAIN_GO, 'utf8');
  const stripped = dropUnusedLambdaImport(stripFirstFuncMain(original));
  writeFileSync(OVERLAY_MAIN, stripped, 'utf8');
  const replace = {
    Replace: {
      [MAIN_GO]: OVERLAY_MAIN,
    },
  };
  writeFileSync(OVERLAY_JSON, JSON.stringify(replace, null, 0), 'utf8');
}

function runGo(childEnv = process.env) {
  writeOverlayFiles();
  const go = spawn(
    'go',
    ['run', `-overlay=${OVERLAY_JSON}`, '-tags', 'local', '.'],
    {
      cwd: APPSYNC_DIR,
      stdio: 'inherit',
      env: childEnv,
    },
  );
  return go;
}

let child = null;
let debounce = null;

function start() {
  if (child) return;
  child = runGo();
  child.on('exit', (code, signal) => {
    child = null;
    if (!watchMode) process.exit(code ?? (signal ? 1 : 0));
  });
  child.on('error', (err) => {
    console.error(err);
    if (!watchMode) process.exit(1);
  });
}

function stop(cb) {
  if (!child) {
    cb?.();
    return;
  }
  const c = child;
  child = null;
  c.once('exit', () => cb?.());
  c.kill('SIGTERM');
}

function restart() {
  stop(() => {
    start();
  });
}

if (watchMode) {
  start();
  watch(
    APPSYNC_DIR,
    { recursive: true },
    (_event, filename) => {
      if (!filename) return;
      if (filename.startsWith('.devgen')) return;
      if (!filename.endsWith('.go')) return;
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        console.log('\n[appsync-local] source changed, restarting…\n');
        restart();
      }, 200);
    },
  );
  process.on('SIGINT', () => {
    stop(() => process.exit(0));
  });
} else {
  start();
}
