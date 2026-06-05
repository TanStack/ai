/**
 * Aggregate every provider's cached spec into a flat list of
 * (providerId, category, mergedSpec) tuples. Used by both openapi-ts.config.ts
 * (one input per tuple) and scripts/generate-endpoint-maps.ts (one set of
 * barrels per tuple).
 */

import type { ProviderCategorySpec } from './providers.js'
import { ALL_PROVIDERS } from './providers/index.js'

export function loadAllProviderSpecs(): Array<ProviderCategorySpec> {
  return ALL_PROVIDERS.flatMap((provider) => provider.load())
}
