// Vendored from `@tanstack/ai-client`'s `tests/test-utils.ts` — the shared
// conformance helpers the upstream `@tanstack/ai-react` tests import. That
// file is not part of the package's published surface, and reaching across
// into a sibling package's tests/ directory would couple this suite to another
// package's internals, so the helpers live here instead.
//
// Their relative source imports are retargeted to the package's PUBLIC entry
// points:
//   - `../src/connection-adapters` / `../src/types` → `@tanstack/ai-client`
//   - core message/stream types                     → `@tanstack/ai/client`
//
// Only the helpers this suite actually uses are kept; the unused ones were
// dropped rather than carried as dead code. Pull more across from upstream as
// further test cases are ported.
import type {
	ConnectConnectionAdapter,
	UIMessage,
} from '@tanstack/ai-client';
import type { ModelMessage, StreamChunk } from '@tanstack/ai/client';

/**
 * Options for creating a mock connection adapter
 */
export interface MockConnectionAdapterOptions {
	/**
	 * Chunks to yield from the stream
	 */
	chunks?: Array<StreamChunk>;

	/**
	 * Delay between chunks (in ms)
	 */
	chunkDelay?: number;

	/**
	 * Whether to throw an error
	 */
	shouldError?: boolean;

	/**
	 * Error to throw
	 */
	error?: Error;

	/**
	 * Callback when connect is called
	 */
	onConnect?: (
		messages: Array<ModelMessage> | Array<UIMessage>,
		data?: Record<string, any>,
		abortSignal?: AbortSignal,
	) => void;

	/**
	 * Callback to check abort signal during streaming
	 */
	onAbort?: (abortSignal: AbortSignal) => void;
}

/**
 * Create a mock connection adapter for testing
 *
 * @example
 * ```typescript
 * const adapter = createMockConnectionAdapter({
 *   chunks: [
 *     { type: "TEXT_MESSAGE_CONTENT", messageId: "1", model: "test", timestamp: Date.now(), delta: "Hello", content: "Hello" },
 *     { type: "RUN_FINISHED", runId: "run-1", model: "test", timestamp: Date.now(), finishReason: "stop" }
 *   ]
 * });
 * ```
 */
export function createMockConnectionAdapter(
	options: MockConnectionAdapterOptions = {},
): ConnectConnectionAdapter {
	const {
		chunks = [],
		chunkDelay = 0,
		shouldError = false,
		error = new Error('Mock adapter error'),
		onConnect,
		onAbort,
	} = options;

	return {
		async *connect(messages, data, abortSignal) {
			if (onConnect) {
				// Type assertion: messages can be ModelMessage[] or UIMessage[]
				// Filter out system messages if present
				const filteredMessages = (messages as any[]).filter(
					(m: any) => !('role' in m) || m.role !== 'system',
				);
				onConnect(filteredMessages as any, data, abortSignal);
			}

			if (shouldError) {
				throw error;
			}

			for (const chunk of chunks) {
				// Check abort signal before yielding
				if (abortSignal?.aborted) {
					if (onAbort) {
						onAbort(abortSignal);
					}
					return;
				}

				if (chunkDelay > 0) {
					await new Promise((resolve) => setTimeout(resolve, chunkDelay));
				}

				// Check again after delay
				if (abortSignal?.aborted) {
					if (onAbort) {
						onAbort(abortSignal);
					}
					return;
				}

				yield chunk;
			}
		},
	};
}

/**
 * Helper to create simple text content chunks (AG-UI format)
 */
export function createTextChunks(
	text: string,
	messageId: string = 'msg-1',
	model: string = 'test',
): Array<StreamChunk> {
	const chunks: Array<StreamChunk> = [];
	let accumulated = '';
	const runId = `run-${messageId}`;
	const threadId = `thread-${messageId}`;

	for (const chunk of text) {
		accumulated += chunk;
		chunks.push({
			type: 'TEXT_MESSAGE_CONTENT',
			messageId,
			model,
			timestamp: Date.now(),
			delta: chunk,
			content: accumulated,
		} as StreamChunk);
	}

	chunks.push({
		type: 'RUN_FINISHED',
		runId,
		threadId,
		model,
		timestamp: Date.now(),
		finishReason: 'stop',
	} as StreamChunk);

	return chunks;
}

/**
 * Helper to create tool call chunks (AG-UI format)
 * Optionally includes tool-input-available chunks to trigger onToolCall
 */
export function createToolCallChunks(
	toolCalls: Array<{ id: string; name: string; arguments: string }>,
	messageId: string = 'msg-1',
	model: string = 'test',
	includeToolInputAvailable: boolean = true,
): Array<StreamChunk> {
	const chunks: Array<StreamChunk> = [];
	const runId = `run-${messageId}`;

	for (let i = 0; i < toolCalls.length; i++) {
		const toolCall = toolCalls[i]!;

		// TOOL_CALL_START event
		chunks.push({
			type: 'TOOL_CALL_START',
			toolCallId: toolCall.id,
			toolCallName: toolCall.name,
			toolName: toolCall.name,
			model,
			timestamp: Date.now(),
			index: i,
		} as StreamChunk);

		// TOOL_CALL_ARGS event
		chunks.push({
			type: 'TOOL_CALL_ARGS',
			toolCallId: toolCall.id,
			model,
			timestamp: Date.now(),
			delta: toolCall.arguments,
		} as StreamChunk);

		// Add tool-input-available CUSTOM chunk if requested
		if (includeToolInputAvailable) {
			let parsedInput: any;
			try {
				parsedInput = JSON.parse(toolCall.arguments);
			} catch {
				parsedInput = toolCall.arguments;
			}

			chunks.push({
				type: 'CUSTOM',
				model,
				timestamp: Date.now(),
				name: 'tool-input-available',
				value: {
					toolCallId: toolCall.id,
					toolName: toolCall.name,
					input: parsedInput,
				},
			} as StreamChunk);
		}
	}

	chunks.push({
		type: 'RUN_FINISHED',
		runId,
		threadId: `thread-${messageId}`,
		model,
		timestamp: Date.now(),
		finishReason: 'tool_calls',
	} as StreamChunk);

	return chunks;
}
