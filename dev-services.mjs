#!/usr/bin/env node
/**
 * Start one or more local dev servers (API, Web) with optional interactive pick.
 *
 * Usage:
 *   node dev-services.mjs
 *   node dev-services.mjs api web
 *   node dev-services.mjs --all
 *   npm run dev:services -- api
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import prompts from 'prompts';

const ROOT = dirname(fileURLToPath(import.meta.url));

/** @type {{ id: string, title: string, npmScript: string, color: string }[]} */
const SERVICES = [
  {
    id: 'api',
    title: 'API (Nest, heylo-api)',
    npmScript: 'dev:api',
    color: 'blue',
  },
  {
    id: 'web',
    title: 'Web (Next, heylo-web)',
    npmScript: 'dev:web',
    color: 'magenta',
  },
];

function printHelp() {
  console.log(`Heylo local dev — pick which services to run.

Usage:
  heylo [options] [service ...]
  npm run dev:services -- [options] [service ...]

Services:
${SERVICES.map((s) => `  ${s.id.padEnd(8)} ${s.title}`).join('\n')}

Options:
  -a, --all     Start every service
  -h, --help    Show this help

Examples:
  heylo                      # interactive multiselect (TTY only)
  heylo api                  # API only
  heylo web api              # both (any order)
  heylo --all                # same as both
`);
}

function parseArgv(argv) {
  const raw = argv.slice(2);
  if (raw.some((a) => a === '-h' || a === '--help')) return { help: true };
  const all = raw.some((a) => a === '-a' || a === '--all');
  const ids = raw.filter((a) => !a.startsWith('-'));
  return { help: false, all, ids };
}

function validateIds(ids) {
  const known = new Set(SERVICES.map((s) => s.id));
  const unknown = ids.filter((id) => !known.has(id));
  if (unknown.length) {
    console.error(`Unknown service(s): ${unknown.join(', ')}`);
    console.error(`Valid: ${[...known].join(', ')}`);
    process.exit(1);
  }
}

/** @param {string[]} ids */
function orderedServices(ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const svc = SERVICES.find((s) => s.id === id);
    if (svc) out.push(svc);
  }
  return out;
}

async function pickServices() {
  const { picked } = await prompts({
    type: 'multiselect',
    name: 'picked',
    message: 'Which services should we start?',
    choices: SERVICES.map((s) => ({ title: s.title, value: s.id })),
    hint: 'Space toggles · Enter runs',
    instructions: false,
    min: 1,
  });
  if (!picked?.length) {
    console.error('Nothing selected.');
    process.exit(1);
  }
  return picked;
}

function warnMissingEnv() {
  const envFile = join(ROOT, '.env');
  if (!existsSync(envFile)) {
    console.warn('Warning: no .env at repo root; copy .env.example to .env if services fail to boot.\n');
  }
}

/**
 * Run a single shell command from the repo root; exits the process when the child exits.
 * @param {string} command
 */
function runShell(command) {
  return new Promise((_, reject) => {
    const child = spawn(command, {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
      shell: true,
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (signal) process.exit(1);
      process.exit(code ?? 1);
    });
  });
}

/** @param {typeof SERVICES} selected */
async function start(selected) {
  warnMissingEnv();
  if (selected.length === 1) {
    await runShell(`npm run ${selected[0].npmScript}`);
    return;
  }
  const names = selected.map((s) => s.id).join(',');
  const colors = selected.map((s) => s.color).join(',');
  const quoted = selected.map((s) => `"npm run ${s.npmScript}"`).join(' ');
  await runShell(`npx concurrently -k -n ${names} -c ${colors} ${quoted}`);
}

async function main() {
  const { help, all, ids: cliIds } = parseArgv(process.argv);
  if (help) {
    printHelp();
    process.exit(0);
  }

  let ids;
  if (all) {
    ids = SERVICES.map((s) => s.id);
  } else if (cliIds.length) {
    ids = cliIds;
  } else if (process.stdin.isTTY) {
    ids = await pickServices();
  } else {
    console.error('Not a TTY: pass service ids (api, web), or use --all. See --help.');
    process.exit(1);
  }

  validateIds(ids);
  const selected = orderedServices(ids);
  await start(selected);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
