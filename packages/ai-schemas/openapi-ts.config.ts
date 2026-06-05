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
  ({ providerId, category, mergedSpec, outputStrategy }) => {
    // Provider-first nested layout — every (provider, activity) tuple owns
    // a `{provider}/{activity}` subpath. The `./*/json-schema` and `./*/zod`
    // exports in package.json still match: Node's exports `*` is a string
    // replacement that may span multiple path segments.
    const outputPath = `./src/providers/${providerId}/${category}`
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
          // For `post-200` providers the POST operations anchor everything we
          // need; `orphans: false` then prunes every schema unreachable from
          // this unit's (activity-filtered) paths. FAL's outputs hang off the
          // excluded sibling GET, so its Input/Output-suffixed schemas must be
          // force-included by name instead.
          ...(outputStrategy === 'sibling-get'
            ? { schemas: { include: '/Input$|Output$/' } }
            : {}),
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
