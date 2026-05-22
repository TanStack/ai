/**
 * @hey-api/openapi-ts driver.
 *
 * For each (provider, category) tuple discovered by the provider registry,
 * emit JSON Schemas + Zod into src/providers/{id}/{category?}/. The post-
 * process step (scripts/generate-endpoint-maps.ts) rewrites the generated
 * schemas.gen.ts to bundle $ref closures and emits endpoint maps.
 */

import { loadAllProviderSpecs } from './scripts/load-all-specs.js'

const originalWarn = console.warn
console.warn = (...args: Array<unknown>) => {
  const message = args[0]
  if (
    typeof message === 'string' &&
    message.includes('Transformers warning:')
  ) {
    return
  }
  originalWarn.apply(console, args)
}

const originalLog = console.log
console.log = (...args: Array<unknown>) => {
  const message = args[0]
  if (
    typeof message === 'string' &&
    message.includes('raw OpenAPI specification')
  ) {
    return
  }
  originalLog.apply(console, args)
}

export default loadAllProviderSpecs().map(
  ({ providerId, category, mergedSpec }) => {
    // Flat layout — every (provider, category) tuple owns a top-level
    // subpath. Matches the `./*/json-schema` and `./*/zod` exports in
    // package.json (Node's `*` wildcard doesn't cross `/`).
    const subpath = category ? `${providerId}-${category}` : providerId
    const outputPath = `./src/providers/${subpath}`
    return {
      input: mergedSpec,
      output: {
        path: outputPath,
        indexFile: false,
        postProcess: ['prettier'],
      },
      plugins: [
        { name: '@hey-api/schemas', type: 'json' },
        { name: 'zod', compatibilityVersion: 4 },
      ],
      parser: {
        filters: {
          // Most providers expose Input/Output suffixes; non-matching schemas
          // are dropped from the codegen output to keep bundles lean.
          schemas: { include: '/Input$|Output$|Request$|Response$/' },
          operations: {
            include: ['/post .*/'],
            exclude: ['/get .*/'],
          },
          orphans: false,
          preserveOrder: true,
        },
      },
    }
  },
)
