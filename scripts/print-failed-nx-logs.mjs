// Print the terminal output of Nx tasks that ran and failed.
//
// Nx 23 keeps a successful task in the workspace-data cache_outputs table
// (code 0) and writes every task's log to <cache>/terminalOutputs/<hash>.
// A failure is a log file whose hash is missing there, or stored with a
// non-zero code. Nx Cloud's CI summary does not print that log.
//
// Usage:
//   node scripts/print-failed-nx-logs.mjs --cache <nx-cache-dir> --data <workspace-data-dir>
import { DatabaseSync } from 'node:sqlite'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function arg(name) {
  const i = process.argv.indexOf(name)
  return i === -1 ? undefined : process.argv[i + 1]
}

const cacheDir = arg('--cache')
const dataDir = arg('--data')
if (!cacheDir || !dataDir) {
  console.error(
    'Usage: print-failed-nx-logs.mjs --cache <nx-cache-dir> --data <workspace-data-dir>',
  )
  process.exit(2)
}

const outputsDir = join(cacheDir, 'terminalOutputs')
if (!existsSync(outputsDir)) {
  console.error(`No Nx terminal output directory at ${outputsDir}`)
  process.exit(0)
}

const db = openCacheDb(dataDir)
const successes = new Set()
if (db) {
  for (const row of db.prepare('SELECT hash, code FROM cache_outputs').all()) {
    if (row.code === 0) successes.add(String(row.hash))
  }
}

const hashes = readdirSync(outputsDir).filter((name) => {
  const path = join(outputsDir, name)
  return statSync(path).isFile() && !successes.has(name)
})

if (hashes.length === 0) {
  console.error(`No failed Nx task logs in ${outputsDir}`)
  process.exit(0)
}

for (const hash of hashes) {
  const text = readFileSync(join(outputsDir, hash), 'utf8')
  console.log(`\nfailed Nx task ${label(db, hash)}`)
  process.stdout.write(text)
  if (!text.endsWith('\n')) console.log()
}

function openCacheDb(dir) {
  if (!existsSync(dir)) {
    console.error(`No Nx workspace-data directory at ${dir}`)
    return null
  }
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.db')) continue
    try {
      const database = new DatabaseSync(join(dir, name), { readOnly: true })
      const table = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cache_outputs'",
        )
        .get()
      if (table) return database
      database.close()
    } catch (error) {
      console.error(`Could not read ${name}: ${error.message}`)
    }
  }
  console.error(`No cache_outputs table under ${dir}`)
  return null
}

function label(database, hash) {
  if (!database) return hash
  try {
    const row = database
      .prepare(
        'SELECT project, target, configuration FROM task_details WHERE hash = ?',
      )
      .get(hash)
    if (!row) return hash
    return row.configuration
      ? `${row.project}:${row.target}:${row.configuration}`
      : `${row.project}:${row.target}`
  } catch {
    return hash
  }
}
