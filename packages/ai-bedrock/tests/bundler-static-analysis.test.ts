import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Regression test for issue #929: `@tanstack/ai-bedrock` used to load its AWS
 * SDK dependencies through dynamic imports whose specifier was a *variable*
 * — `const mod = '@aws-sdk/...'; import(mod)` with a leading @vite-ignore
 * comment. Static bundlers — esbuild, bun build, Rollup — cannot resolve
 * `import()` when the argument is not a string literal, so the SDK was left
 * external and runtime resolution failed in `node_modules`-free server
 * bundles.
 *
 * The fix is to use string-literal specifiers (`import('@aws-sdk/...')`). This
 * test pins the contract: every AWS SDK dynamic import in the adapter must use
 * a string-literal specifier. If a future refactor brings the variable-specifier
 * pattern back, this test fails before the regression ships.
 *
 * Why a source-level check (not a real bundler run): the contract is purely
 * about static analysability — whether the specifier is a literal or not. A
 * regex over the source is the smallest test that faithfully pins it, with no
 * new dev dependency (esbuild/acorn/etc.) and no slow build step in the unit
 * suite. The behaviour is unchanged at runtime; only the static shape matters.
 */
describe('AWS SDK dynamic imports — static-bundler resolvable (#929)', () => {
  const cases = [
    {
      file: 'src/utils/auth.ts',
      sdk: '@aws-sdk/credential-providers',
      // The credential-providers import is inside an async lambda inside
      // resolveBedrockAuth's sigv4 branch — assert the literal import is
      // present at all (the anti-pattern check below guards the regression).
    },
    {
      file: 'src/adapters/converse-text.ts',
      sdk: '@aws-sdk/client-bedrock-runtime',
    },
  ] as const

  for (const { file, sdk } of cases) {
    describe(`${file} → ${sdk}`, () => {
      const path = fileURLToPath(new URL(`../${file}`, import.meta.url))
      const source = readFileSync(path, 'utf8')

      it('imports the SDK via a string-literal specifier', () => {
        // Required shape: `import('@aws-sdk/...')` — single or double quotes.
        // Matches `import('@aws-sdk/foo')`, `import("@aws-sdk/foo")`, and
        // whitespace variations like `import( '@aws-sdk/foo' )`.
        const literalPattern = new RegExp(
          `import\\s*\\(\\s*['"]${escapeRegex(sdk)}['"]\\s*\\)`,
        )
        expect(literalPattern.test(source)).toBe(true)
      })

      it('does not use the variable-specifier anti-pattern', () => {
        // Anti-pattern: `const mod = '@aws-sdk/...'; ... import(/* @vite-ignore */ mod)`
        // — the variable defeats static analysers. Pin both halves: the
        // variable assignment and the `@vite-ignore`-commented `import(mod)`.
        const variableAssignment = new RegExp(
          `const\\s+mod\\s*=\\s*['"]${escapeRegex(sdk)}['"]`,
        )
        const viteIgnoredModImport = /import\s*\(\s*\/\*\s*@vite-ignore\s*\*\/\s*mod\s*\)/
        expect(variableAssignment.test(source)).toBe(false)
        expect(viteIgnoredModImport.test(source)).toBe(false)
      })
    })
  }
})

/** Escape RegExp metacharacters in a package specifier (`@`/`/` are safe). */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
