/**
 * The module registry (Draft 0.2 §7.3.2) — the host's real component
 * ecosystem, allow-listed and version-pinned. A react-tsx artifact may import
 * *only* these specifiers; anything else fails the build (§7.3.3).
 *
 * Adding a module is a host release action, never a runtime request (§7.3.2).
 */

import type { BuildDiagnostic, ModuleRegistry, ModuleRegistryEntry } from './types'

/** Pinned version of the reference registry; recorded on artifacts (§3.1). */
export const REFERENCE_REGISTRY_VERSION = 'runtime-2026.10'

/**
 * The reference registry (§7.3.2 table). `url` points at the sandbox-origin
 * runtime route (§4.1); the shell's import map resolves bare specifiers here.
 */
export const REFERENCE_REGISTRY: ModuleRegistry = {
  version: REFERENCE_REGISTRY_VERSION,
  modules: [
    {
      name: 'react',
      version: '19.2.3',
      url: `/sandbox/_runtime/${REFERENCE_REGISTRY_VERSION}/react.js`,
      description: 'The runtime itself.',
    },
    {
      name: 'react-dom',
      version: '19.2.3',
      url: `/sandbox/_runtime/${REFERENCE_REGISTRY_VERSION}/react-dom.js`,
      description: 'The runtime itself (DOM renderer).',
    },
    {
      name: 'react/jsx-runtime',
      version: '19.2.3',
      url: `/sandbox/_runtime/${REFERENCE_REGISTRY_VERSION}/react-jsx-runtime.js`,
      description: 'Automatic JSX runtime (resolved by the compiler, §7.3.3).',
    },
    {
      name: '@tanstack/react-table',
      version: '8.21.3',
      url: `/sandbox/_runtime/${REFERENCE_REGISTRY_VERSION}/tanstack-react-table.js`,
      description:
        'TanStack Table v8 (headless). Import EXACTLY: useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, flexRender, createColumnHelper. Define columns as plain objects [{ accessorKey, header, cell }], pass { data, columns, getCoreRowModel: getCoreRowModel() } to useReactTable, and render with table.getHeaderGroups()/getRowModel() + flexRender. Do NOT use the v7 useTable/useSortBy API.',
    },
    {
      name: '@tanstack/react-charts',
      version: '3.0.0-beta',
      url: `/sandbox/_runtime/${REFERENCE_REGISTRY_VERSION}/tanstack-react-charts.js`,
      description:
        'TanStack Charts. Import EXACTLY: Chart. Render <Chart options={{ data: [{ label, data: [{ primary, secondary }] }], primaryAxis: { getValue: d => d.primary }, secondaryAxes: [{ getValue: d => d.secondary }] }} /> inside a fixed-height container.',
    },
    {
      name: '@tanstack/react-query',
      version: '5.90.5',
      url: `/sandbox/_runtime/${REFERENCE_REGISTRY_VERSION}/tanstack-react-query.js`,
      description:
        'Data fetching inside the frame; permitted only against §9.3-granted connect-src domains, or via bridge host.data refreshes.',
    },
    {
      name: '@ogui/bridge',
      version: '0.2.0',
      url: `/sandbox/_runtime/${REFERENCE_REGISTRY_VERSION}/ogui-bridge.js`,
      description: 'useHostState, useIntent, useTheme — the §6 bridge as React imports.',
    },
    {
      name: '@host/ui',
      version: '0.2.0',
      url: `/sandbox/_runtime/${REFERENCE_REGISTRY_VERSION}/host-ui.js`,
      description:
        'Host design-system primitives. Exports EXACTLY: Card, Button, Input, Slider, Select, Label, Checkbox — import only these names. For anything else (text, headings, layout, badges) use plain HTML elements (div/p/h3/span) styled with host theme CSS variables: var(--ui-text), var(--ui-muted), var(--ui-accent), var(--ui-surface), var(--ui-border).',
    },
  ],
}

/** Look up a registry entry by exact specifier name. */
export function getRegistryEntry(registry: ModuleRegistry, name: string): ModuleRegistryEntry | undefined {
  return registry.modules.find((m) => m.name === name)
}

/**
 * Reduce an import specifier to the package name the registry is keyed by.
 * `@tanstack/react-table/foo` → `@tanstack/react-table`; `react/jsx-runtime`
 * stays whole only if the registry lists it, else falls back to `react`.
 */
export function packageBase(specifier: string): string {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    return parts.slice(0, 2).join('/')
  }
  const parts = specifier.split('/')
  return parts[0] ?? specifier
}

/** Is `specifier` a relative/absolute path rather than a bare package import? */
export function isPathImport(specifier: string): boolean {
  return specifier.startsWith('.') || specifier.startsWith('/')
}

const IMPORT_RE =
  // static `import ... from 'x'`, bare `import 'x'`, and `import('x')`
  /(?:import\s+(?:[^'"]*?\s+from\s+)?|import\s*\(\s*|export\s+[^'"]*?\s+from\s+)['"]([^'"]+)['"]/g

/** Every module specifier a source imports, in source order (deduped). */
export function extractImports(source: string): Array<string> {
  const found = new Set<string>()
  let m: RegExpExecArray | null
  IMPORT_RE.lastIndex = 0
  while ((m = IMPORT_RE.exec(source)) !== null) {
    if (m[1]) found.add(m[1])
  }
  return [...found]
}

/**
 * Pre-build allowlist gate (§7.3.3). Returns the registry specifiers the source
 * imports (the shell's import-map externals) and diagnostics for any specifier
 * not in the registry or resolved as a path. Imports resolve *only* against the
 * registry; relative/path imports fail (single-file artifact, §12.4).
 */
export function checkImports(
  source: string,
  registry: ModuleRegistry,
): { ok: boolean; externals: Array<string>; diagnostics: Array<BuildDiagnostic> } {
  const diagnostics: Array<BuildDiagnostic> = []
  const externals = new Set<string>()
  const allowed = new Set(registry.modules.map((m) => m.name))

  for (const spec of extractImports(source)) {
    if (isPathImport(spec)) {
      diagnostics.push({
        message: `Relative/path import "${spec}" is not allowed. A frame artifact is a single module; import only registry modules.`,
        specifier: spec,
      })
      continue
    }
    if (allowed.has(spec)) {
      externals.add(spec)
      continue
    }
    const base = packageBase(spec)
    if (allowed.has(base)) {
      externals.add(base)
      continue
    }
    const names = registry.modules.map((m) => m.name).join(', ')
    diagnostics.push({
      message: `Import "${spec}" is not in the module registry (${registry.version}). Allowed: ${names}.`,
      specifier: spec,
    })
  }

  return { ok: diagnostics.length === 0, externals: [...externals], diagnostics }
}

/**
 * Model-facing description of the registry for authoring guidance (§7.3.2).
 * Fed into the create_artifact tool description / system prompt.
 */
export function describeRegistryForPrompt(registry: ModuleRegistry): string {
  const lines = registry.modules.map((m) => `- \`${m.name}\` (v${m.version}) — ${m.description}`)
  return [
    `Module registry ${registry.version}. In a react-tsx artifact you may import ONLY these specifiers (any other import fails the build):`,
    ...lines,
  ].join('\n')
}
