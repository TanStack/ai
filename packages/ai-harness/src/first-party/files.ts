import { readFile, readdir } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { defineCommand } from '../commands'
import { definePlugin } from '../plugins'
import type { AnyCommand } from '../commands'

async function readIfPresent(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Add project instruction files (AGENTS.md, CLAUDE.md) to the system prompt,
 * read once when the session opens.
 */
export function projectInstructions(options: {
  root: string
  files?: ReadonlyArray<string>
}) {
  const files = options.files ?? ['AGENTS.md', 'CLAUDE.md']
  return definePlugin({
    name: 'tanstack/project-instructions',
    setup: async () => {
      const found: Array<string> = []
      for (const file of files) {
        const text = await readIfPresent(resolve(options.root, file))
        if (text?.trim())
          found.push(`Project instructions from ${file}:\n${text.trim()}`)
      }
      return { prompts: found }
    },
  })
}

/** Split `---` frontmatter from a Markdown file. */
function splitFrontmatter(text: string): {
  description?: string
  body: string
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (!match) return { body: text }
  const description = /^description:\s*(.+)$/m.exec(match[1] ?? '')?.[1]?.trim()
  return {
    ...(description ? { description } : {}),
    body: text.slice(match[0].length),
  }
}

/**
 * One command per Markdown file in `dir` (like `.claude/commands/*.md`).
 * Running `/name args` sends the file as a prompt, with `$ARGUMENTS`
 * replaced by the args.
 */
export function fileCommands(options: { dir: string }) {
  return definePlugin({
    name: 'tanstack/file-commands',
    setup: async (ctx) => {
      let names: Array<string> = []
      try {
        names = (await readdir(options.dir)).filter(
          (file) => extname(file) === '.md',
        )
      } catch {
        return {}
      }
      const commands: Record<string, AnyCommand> = {}
      for (const file of names) {
        const name = basename(file, '.md')
        const { description, body } = splitFrontmatter(
          await readFile(resolve(options.dir, file), 'utf8'),
        )
        commands[name] = defineCommand({
          description: description ?? `Run ${file}`,
          run: (input: unknown) => {
            const args =
              typeof input === 'string'
                ? input
                : input === undefined
                  ? ''
                  : JSON.stringify(input)
            ctx.session.prompt(body.split('$ARGUMENTS').join(args).trim())
            return `Sent /${name}.`
          },
        })
      }
      return { commands }
    },
  })
}
