import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createReviewTools } from './tools'

const bases: Array<string> = []

async function makeWorktree() {
  const base = await mkdtemp(join(tmpdir(), 'ai-review-tools-'))
  const root = join(base, 'work')
  await mkdir(root)
  bases.push(base)
  return root
}

afterEach(async () => {
  const pending = bases.splice(0)
  for (const base of pending) {
    await rm(base, { recursive: true, force: true })
  }
})

function toolNamed(tools: ReturnType<typeof createReviewTools>, name: string) {
  const tool = tools.find((item) => item.name === name)
  if (tool === undefined) throw new Error(`missing tool ${name}`)
  return tool
}

async function runExecute(tool: ReturnType<typeof toolNamed>, args: unknown) {
  const execute = tool.execute
  if (execute === undefined) throw new Error(`${tool.name} has no execute`)
  return execute(args)
}

describe('createReviewTools', () => {
  it('returns read_file and edit_file with execute', async () => {
    const root = await makeWorktree()
    const tools = createReviewTools({ worktreeRoot: root })
    expect(tools.map((tool) => tool.name)).toEqual(['read_file', 'edit_file'])
    for (const tool of tools) {
      expect(tool.execute).toEqual(expect.any(Function))
    }
  })

  it('read_file returns the UTF-8 file contents', async () => {
    const root = await makeWorktree()
    await writeFile(join(root, 'note.txt'), 'hello from worktree')
    const tools = createReviewTools({ worktreeRoot: root })

    const result = await runExecute(toolNamed(tools, 'read_file'), {
      path: 'note.txt',
    })

    expect(result).toEqual({ content: 'hello from worktree' })
  })

  it('edit_file writes the file and returns ok', async () => {
    const root = await makeWorktree()
    const tools = createReviewTools({ worktreeRoot: root })

    const result = await runExecute(toolNamed(tools, 'edit_file'), {
      path: 'note.txt',
      content: 'patched by review',
    })

    expect(result).toEqual({ ok: true })
    expect(await readFile(join(root, 'note.txt'), 'utf8')).toBe(
      'patched by review',
    )
  })
})
