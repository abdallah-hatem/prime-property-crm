#!/usr/bin/env node
// Per-agent databases and ports, so parallel agents run their e2e side by side.
//
//   node scripts/db-agent.mjs template                 migrate + foundation-seed prime_crm_template
//   node scripts/db-agent.mjs create <name> [--agent N] [--no-refresh]
//                                                      refresh the template, then
//                                                      CREATE DATABASE prime_crm_<name>_test TEMPLATE prime_crm_template
//                                                      and print the env lines to use
//   node scripts/db-agent.mjs drop <name>              drop prime_crm_<name>_test (only that one)
//   node scripts/db-agent.mjs list                     list agent databases
//   node scripts/db-agent.mjs ports <N>                print agent N's port block (API 31N1, web 31N3)
//
// Root shortcuts: npm run db:agent -- <command> ...
//
// The Postgres server comes from DB_SERVER_URL if set, otherwise from DATABASE_URL in
// apps/api/.env (only its host, port and credentials are used — never the ambient DATABASE_URL,
// which may point at another agent's database). Agent databases always end in `_test`, so the
// e2e guard in apps/api/test/setup-env.ts accepts them and nothing here can touch prime_crm.
// Docs: docs/notes/testing.md.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = resolve(root, 'apps', 'api');
const apiRequire = createRequire(resolve(apiDir, 'package.json'));
// pg ships with @prisma/adapter-pg (an API dependency); resolve it from there.
const { Client } = apiRequire('pg');

/** Absolute path of a package's CLI, so it runs under this node without a shell. */
function cli(pkg) {
  const manifestPath = apiRequire.resolve(`${pkg}/package.json`);
  const { bin } = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return resolve(
    dirname(manifestPath),
    typeof bin === 'string' ? bin : bin[pkg],
  );
}

const TEMPLATE_DB = 'prime_crm_template';
const PREFIX = 'prime_crm_';
const SUFFIX = '_test';
const RESERVED = new Set(['prime_crm', 'prime_crm_test', TEMPLATE_DB]);
const LOCK_KEY = 4_810_022; // advisory lock: one template refresh/copy at a time

function fail(message) {
  console.error(`db-agent: ${message}`);
  process.exit(1);
}

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

function serverUrl() {
  const raw =
    process.env.DB_SERVER_URL ??
    readEnvFile(resolve(apiDir, '.env')).DATABASE_URL;
  if (!raw)
    fail(
      'set DB_SERVER_URL or DATABASE_URL in apps/api/.env (copy .env.example)',
    );
  return new URL(raw);
}

function urlFor(database) {
  const url = serverUrl();
  url.pathname = `/${database}`;
  if (!url.searchParams.has('schema')) url.searchParams.set('schema', 'public');
  return url.toString();
}

function dbName(name) {
  if (!name) fail('missing <name> (e.g. t5)');
  const clean = name.toLowerCase().replace(/-/g, '_');
  if (!/^[a-z0-9][a-z0-9_]{0,40}$/.test(clean))
    fail(`invalid name "${name}": letters, digits, _ or - only`);
  const base = clean.endsWith(SUFFIX) ? clean.slice(0, -SUFFIX.length) : clean;
  const db = `${PREFIX}${base}${SUFFIX}`;
  if (RESERVED.has(db)) fail(`"${db}" is reserved`);
  return db;
}

/** Agent N's port block: API 31N1, web 31N3 (N = 1..9). */
function ports(n) {
  const agent = Number(n);
  if (!Number.isInteger(agent) || agent < 1 || agent > 9)
    fail(`agent number must be 1..9, got "${n}"`);
  const api = 3100 + agent * 10 + 1;
  const web = 3100 + agent * 10 + 3;
  return { api, web };
}

const quoteIdent = (id) => `"${id.replace(/"/g, '""')}"`;

async function withServer(fn) {
  const client = new Client({ connectionString: urlFor('postgres') });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function exists(client, database) {
  const res = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [database],
  );
  return res.rowCount > 0;
}

function run(label, pkg, args, env) {
  try {
    execFileSync(process.execPath, [cli(pkg), ...args], {
      cwd: apiDir,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const out = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
    fail(`${label} failed:\n${out}`);
  }
}

/** Creates the template if missing, applies every migration and the foundation seed. */
async function refreshTemplate(client) {
  if (!(await exists(client, TEMPLATE_DB))) {
    await client.query(`CREATE DATABASE ${quoteIdent(TEMPLATE_DB)}`);
    console.error(`db-agent: created ${TEMPLATE_DB}`);
  }
  const url = urlFor(TEMPLATE_DB);
  run('prisma migrate deploy', 'prisma', ['migrate', 'deploy'], {
    DATABASE_URL: url,
  });
  // Foundation only: roles, default outcomes, settings, first admin (SEED_ADMIN_* from
  // apps/api/.env). Sample data is opt-in per agent database (npm run db:seed).
  run('foundation seed', 'tsx', ['prisma/seed.ts'], {
    DATABASE_URL: url,
    SEED_ALLOW_SAMPLE: 'false',
  });
  console.error(`db-agent: ${TEMPLATE_DB} migrated and seeded`);
}

async function copyTemplate(client, database) {
  // A copy fails while anything is connected to the template; retry briefly.
  for (let attempt = 1; ; attempt++) {
    try {
      await client.query(
        `CREATE DATABASE ${quoteIdent(database)} TEMPLATE ${quoteIdent(TEMPLATE_DB)}`,
      );
      return;
    } catch (error) {
      if (attempt >= 10 || !/being accessed by other users/.test(error.message))
        throw error;
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
}

async function main() {
  const [command, name, ...rest] = process.argv.slice(2);
  const flag = (f) => rest.includes(f) || name === f;
  const agentIdx = rest.indexOf('--agent');
  const agent = agentIdx >= 0 ? rest[agentIdx + 1] : undefined;

  switch (command) {
    case 'template':
      await withServer(async (client) => {
        await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
        await refreshTemplate(client);
      });
      return;

    case 'create': {
      const database = dbName(name);
      await withServer(async (client) => {
        await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);
        if (await exists(client, database))
          fail(
            `${database} already exists (drop it first: db-agent drop ${name})`,
          );
        if (!flag('--no-refresh') || !(await exists(client, TEMPLATE_DB)))
          await refreshTemplate(client);
        await copyTemplate(client, database);
      });
      console.error(`db-agent: created ${database} from ${TEMPLATE_DB}`);
      console.log(`DATABASE_URL=${urlFor(database)}`);
      if (agent !== undefined) {
        const p = ports(agent);
        console.log(`PORT=${p.api}`);
        console.log(`API_PORT=${p.api}`);
        console.log(`WEB_PORT=${p.web}`);
        console.log(`BASE_URL=http://localhost:${p.web}`);
      }
      return;
    }

    case 'drop': {
      const database = dbName(name);
      await withServer((client) =>
        client.query(
          `DROP DATABASE IF EXISTS ${quoteIdent(database)} WITH (FORCE)`,
        ),
      );
      console.log(`db-agent: dropped ${database}`);
      return;
    }

    case 'list':
      await withServer(async (client) => {
        const res = await client.query(
          "SELECT datname FROM pg_database WHERE datname LIKE 'prime\\_crm\\_%' ORDER BY 1",
        );
        for (const row of res.rows) console.log(row.datname);
      });
      return;

    case 'ports': {
      const p = ports(name);
      console.log(`PORT=${p.api}`);
      console.log(`API_PORT=${p.api}`);
      console.log(`WEB_PORT=${p.web}`);
      console.log(`BASE_URL=http://localhost:${p.web}`);
      return;
    }

    default:
      fail(
        'usage: db-agent.mjs template | create <name> [--agent N] [--no-refresh] | drop <name> | list | ports <N>',
      );
  }
}

main().catch((error) =>
  fail(error instanceof Error ? error.message : String(error)),
);
