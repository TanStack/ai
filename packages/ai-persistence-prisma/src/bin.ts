import { runCli } from './cli'

try {
  const result = await runCli(process.argv.slice(2), {
    writeStdout: (value) => process.stdout.write(value),
  })
  if (result.kind === 'help') {
    process.stdout.write(result.text)
  } else if (result.kind === 'file') {
    process.stdout.write(`Wrote ${result.path}\n`)
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  )
  process.exitCode = 1
}
