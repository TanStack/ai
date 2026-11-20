export function withCleanupFailure(
  operationError: unknown,
  cleanupError: unknown,
): AggregateError {
  return new AggregateError(
    [operationError, cleanupError],
    'modal: operation failed and sandbox cleanup also failed',
    { cause: operationError },
  )
}
