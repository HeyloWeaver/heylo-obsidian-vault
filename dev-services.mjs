#!/usr/bin/env node
/**
 * Start one or more local dev servers (API, Web, Go/AppSync) with optional interactive pick.
 * Services not started locally automatically fall back to cloud URLs from .env.
 *
 * Usage:
 *   node dev-services.mjs
 *   node dev-services.mjs api web
 *   node dev-services.mjs --all
 *   npm run dev:services -- api
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import prompts from 'prompts';

const ROOT = dirname(fileURLToPath(import.meta.url));

/**
 * Read key=value pairs from .env without touching process.env.
 * Used to surface cloud URL values in the routing summary.
 * @returns {Record<string, string>}
 */
function readDotEnv() {
  try {
    const src = readFileSync(join(ROOT, '.env'), 'utf8');
    const env = {};
    for (const line of src.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }
    return env;
  } catch {
    return {};
  }
}

/**
 * Each service declares the env vars it provides when running locally.
 * .env should hold the cloud equivalents as defaults — the CLI injects
 * localhost values for whichever services you actually start.
 *
 * @type {{ id: string, title: string, npmScript: string, color: string, port: number, localEnv: Record<string, string> }[]}
 */
const SERVICES = [
  {
    id: 'api',
    title: 'API (Nest, heylo-api)',
    npmScript: 'dev:api',
    color: 'blue',
    port: 4000,
    localEnv: {
      NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000',
    },
  },
  {
    id: 'web',
    title: 'Web (Next, heylo-web)',
    npmScript: 'dev:web',
    color: 'magenta',
    port: 3000,
    localEnv: {},
  },
  {
    id: 'go',
    title: 'AppSync (Go — local GraphQL + cloud MySQL via DB_* in .env)',
    npmScript: 'dev:go',
    color: 'cyan',
    port: 8080,
    localEnv: {
      NEXT_PUBLIC_APPSYNC_GRAPHQL_ENDPOINT: 'http://localhost:8080/graphql',
    },
  },
];

function printHelp() {
  console.log(`Heylo local dev — pick which services to run.
Services not started locally fall back to cloud URLs from .env automatically.

Usage:
  heylo [options] [service ...]
  npm run dev:services -- [options] [service ...]

Services:
${SERVICES.map((s) => `  ${s.id.padEnd(8)} ${s.title}`).join('\n')}

Options:
  -a, --all     Start every service locally
  -h, --help    Show this help

Examples:
  heylo                      # interactive multiselect (TTY only)
  heylo api                  # API local, everything else → cloud
  heylo api web              # API + web local, go → cloud (any order)
  heylo go                   # Go GraphQL on :8080; set DB_* (or APPSYNC_MYSQL_DSN) in .env like the API
  heylo --all                # all services local
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
 * For each service running locally, inject its localEnv values into process.env so
 * child processes inherit them. dotenv-cli won't overwrite already-set vars, so local
 * values take precedence over whatever .env has.
 *
 * Services NOT in `selected` keep whatever .env has (their cloud URLs).
 * Prints a routing summary so it's always clear what's hitting local vs cloud.
 *
 * @param {typeof SERVICES} selected
 * @param {Record<string, string>} dotEnv  parsed .env values (for display only)
 */
function applyLocalEnv(selected, dotEnv) {
  const selectedIds = new Set(selected.map((s) => s.id));
  const rows = [];

  for (const svc of SERVICES) {
    if (!Object.keys(svc.localEnv).length) continue; // web has no env vars to route
    const isLocal = selectedIds.has(svc.id);
    for (const [key, localVal] of Object.entries(svc.localEnv)) {
      if (isLocal) {
        process.env[key] = localVal;
        rows.push({ label: key, value: localVal, tag: 'local' });
      } else {
        const cloudVal = dotEnv[key] || process.env[key] || '(not set in .env)';
        rows.push({ label: key, value: cloudVal, tag: 'cloud' });
      }
    }
  }

  if (rows.length) {
    const pad = Math.max(...rows.map((r) => r.label.length));
    console.log('Routing:');
    for (const { label, value, tag } of rows) {
      const marker = tag === 'local' ? '↳ local' : '↳ cloud';
      console.log(`  ${label.padEnd(pad)}  ${marker}  ${value}`);
    }
    console.log('');
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
  const dotEnv = readDotEnv();
  applyLocalEnv(selected, dotEnv);

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
    console.error('Not a TTY: pass service ids (api, web, go), or use --all. See --help.');
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
