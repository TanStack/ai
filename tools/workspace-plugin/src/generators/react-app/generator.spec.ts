import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing'
import { describe, expect, it } from 'vitest'
import reactAppGenerator from './generator'

describe('react-app generator', () => {
  it('writes a thin chat lab under examples/react/lab-byok', async () => {
    const tree = createTreeWithEmptyWorkspace()
    await reactAppGenerator(tree, { name: 'lab-byok' })

    const pkg = tree.read('examples/react/lab-byok/package.json', 'utf-8')
    expect(pkg).toContain('"@tanstack/ai": "workspace:*"')
    expect(pkg).toContain('"@tanstack/ai-mistral": "workspace:*"')
    expect(pkg).not.toContain('@tanstack/ai-vue')
    expect(pkg).not.toContain('"nitro"')

    const apiChat = tree.read(
      'examples/react/lab-byok/src/routes/api.chat.ts',
      'utf-8',
    )
    expect(apiChat).toContain('chat(')

    const envExample = tree.read(
      'examples/react/lab-byok/.env.example',
      'utf-8',
    )
    expect(envExample).toContain('OPENAI_API_KEY')

    const byok = tree.read('examples/react/lab-byok/src/lib/byok.ts', 'utf-8')
    expect(byok).toContain('openaiByok')

    const index = tree.read(
      'examples/react/lab-byok/src/routes/index.tsx',
      'utf-8',
    )
    expect(index).toContain('forwardedProps')
    expect(index).not.toContain('byokProvider:')

    const vite = tree.read('examples/react/lab-byok/vite.config.ts', 'utf-8')
    expect(vite).toContain('3100')
    expect(vite).not.toContain('nitro')

    const tsconfig = tree.read('examples/react/lab-byok/tsconfig.json', 'utf-8')
    expect(tsconfig).not.toContain('"extends"')
    expect(tsconfig).toContain('"moduleResolution": "Bundler"')
    expect(tsconfig).toContain('"@/*"')

    const generated = tree
      .listChanges()
      .filter((change) => change.path.includes('examples/react/lab-byok/'))
      .map((change) => tree.read(change.path, 'utf-8') ?? '')
      .join('\n')
    expect(generated).not.toContain('getGuitars')
    expect(generated).not.toContain('recommendGuitar')
  })
})
