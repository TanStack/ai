// The projection combinators live in `@tanstack/ai` core (it owns the `context`
// type, so it owns the way to build one). Re-exported here so `optimize()` users
// can import everything from `@tanstack/ai-optimize`.
export {
  truncateHead,
  truncateTail,
  truncateHeadTail,
  dropWithRef,
  aboveTokens,
  type StrategyOptions,
} from '@tanstack/ai'
