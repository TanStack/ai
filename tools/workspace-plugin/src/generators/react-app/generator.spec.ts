import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing'
import { describe, expect, it } from 'vitest'
import reactAppGenerator from './generator'

describe('react-app generator', () => {
  it('writes a thin chat lab under examples/lab-byok', async () => {
    const tree = createTreeWithEmptyWorkspace()
    await reactAppGenerator(tree, { name: 'lab-byok' })

    const pkg = tree.read('examples/lab-byok/package.json', 'utf-8')
    expect(pkg).toContain('"@tanstack/ai": "workspace:*"')
    expect(pkg).toContain('"@tanstack/ai-mistral": "workspace:*"')
    expect(pkg).not.toContain('@tanstack/ai-vue')

    const apiChat = tree.read(
      'examples/lab-byok/src/routes/api.chat.ts',
      'utf-8',
    )
    expect(apiChat).toContain('chat(')

    const envExample = tree.read('examples/lab-byok/.env.example', 'utf-8')
    expect(envExample).toContain('OPENAI_API_KEY')

    const byok = tree.read('examples/lab-byok/src/lib/byok.ts', 'utf-8')
    expect(byok).toContain('openaiByok')

    const vite = tree.read('examples/lab-byok/vite.config.ts', 'utf-8')
    expect(vite).toContain('3100')

    const generated = tree
      .listChanges()
      .filter((change) => change.path.includes('examples/lab-byok/'))
      .map((change) => tree.read(change.path, 'utf-8') ?? '')
      .join('\n')
    expect(generated).not.toContain('getGuitars')
    expect(generated).not.toContain('recommendGuitar')
  })
})
