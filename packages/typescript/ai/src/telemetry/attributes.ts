interface BaseSpanAttributes {
  model: { name: string; provider: string }
  operationName: string
  conversationId?: string
  outputType?: string
}

/**
 * Attributes shared by all spans
 */
export function buildSpanAttributes({
  model,
  conversationId,
  operationName,
  outputType
}: BaseSpanAttributes) {
  return {
    'gen_ai.operation.name': operationName,
    'gen_ai.provider.name': model.provider,
    'gen_ai.request.model': model.name,
    'gen_ai.conversation.id': conversationId,
    'gen_ai.output.type': outputType,
  }
}

export function buildToolCallSpanAttributes({
  model,
  conversationId,
  tool,
}: BaseSpanAttributes & {
  tool: { name: string; id: string }
}) {
  return {
    ...buildSpanAttributes({ model, conversationId, operationName: 'execute_tool' }),
    'gen_ai.tool.name': tool.name,
    'gen_ai.tool.call.id': tool.id,
  }
}