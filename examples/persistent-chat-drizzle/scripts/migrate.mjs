// Apply the committed drizzle-kit SQL migrations directly with Node's built-in
// SQLite driver — no drizzle-kit runtime driver (better-sqlite3/libsql) needed.
// Tracks applied files in `__migrations` so re-runs are a no-op, and splits each
// file on drizzle's `--> statement-breakpoint` markers.
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const DB_PATH = './.data/persistent-chat.db'
const MIGRATIONS_DIR = './drizzle'

mkdirSync(dirname(DB_PATH), { recursive: true })
const db = new DatabaseSync(DB_PATH)
db.exec(
  `CREATE TABLE IF NOT EXISTS __migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`,
)

const applied = new Set(
  db
    .prepare('SELECT name FROM __migrations')
    .all()
    .map((row) => row.name),
)

let files = []
try {
  files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
} catch {
  console.error(
    `No migrations found in ${MIGRATIONS_DIR}. Run \`pnpm db:generate\` first.`,
  )
  process.exit(1)
}

let ran = 0
for (const file of files) {
  if (applied.has(file)) continue
  const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
  for (const statement of sql.split('--> statement-breakpoint')) {
    const trimmed = statement.trim()
    if (trimmed) db.exec(trimmed)
  }
  db.prepare('INSERT INTO __migrations (name, applied_at) VALUES (?, ?)').run(
    file,
    Date.now(),
  )
  ran++
  console.log(`applied ${file}`)
}

console.log(ran === 0 ? 'migrations up to date' : `applied ${ran} migration(s)`)
db.close()
