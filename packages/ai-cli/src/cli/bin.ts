// pkg is bundled into the bin by tsup; provides the version reported by
// --version and embedded in the introspect manifest.
import pkg from '../../package.json'
import { loadDotEnv } from '../core/env'
import { run } from './run'

// Load a conventional .env from cwd before anything resolves API keys.
loadDotEnv()

const argv = process.argv.slice(2)

run(argv, pkg.version)
  .then((code) => {
    process.exitCode = code
  })
  .catch((err: unknown) => {
    // Last-resort guard; run() is expected to handle everything itself.
    process.stderr.write(
      `error: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exitCode = 1
  })
