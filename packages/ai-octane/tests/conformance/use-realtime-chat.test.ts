import { act, renderHook } from '@octanejs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RealtimeEvent, RealtimeEventPayloads, RealtimeToken, UsageInfo } from '@tanstack/ai';
import type { RealtimeAdapter, RealtimeConnection } from '@tanstack/ai-client';
import { useRealtimeChat } from '../../src/use-realtime-chat.tsrx';
import type { UseRealtimeChatOptions } from '../../src/realtime-types';

interface TestConnection {
	connection: RealtimeConnection;
	updateSession: ReturnType<typeof vi.fn<RealtimeConnection['updateSession']>>;
	emit<TEvent extends RealtimeEvent>(event: TEvent, payload: RealtimeEventPayloads[TEvent]): void;
}

function createConnection(): TestConnection {
	const updateSession = vi.fn<RealtimeConnection['updateSession']>();
	const listeners = new Map<RealtimeEvent, Set<(payload: unknown) => void>>();
	const on: RealtimeConnection['on'] = (event, handler) => {
		let eventListeners = listeners.get(event);
		if (!eventListeners) {
			eventListeners = new Set();
			listeners.set(event, eventListeners);
		}
		const listener = handler as unknown as (payload: unknown) => void;
		eventListeners.add(listener);
		return () => eventListeners.delete(listener);
	};
	function emit<TEvent extends RealtimeEvent>(
		event: TEvent,
		payload: RealtimeEventPayloads[TEvent],
	): void {
		for (const listener of listeners.get(event) ?? []) listener(payload);
	}
	const connection: RealtimeConnection = {
		disconnect: vi.fn(async () => {}),
		startAudioCapture: vi.fn(async () => {}),
		stopAudioCapture: vi.fn(),
		sendText: vi.fn(),
		sendImage: vi.fn(),
		sendToolResult: vi.fn(),
		updateSession,
		interrupt: vi.fn(),
		on,
		getAudioVisualization: () => ({
			inputLevel: 0,
			outputLevel: 0,
			getInputFrequencyData: () => new Uint8Array(128),
			getOutputFrequencyData: () => new Uint8Array(128),
			getInputTimeDomainData: () => new Uint8Array(128),
			getOutputTimeDomainData: () => new Uint8Array(128),
			inputSampleRate: 48_000,
			outputSampleRate: 48_000,
		}),
	};
	return { connection, updateSession, emit };
}

function createAdapter(provider: string, connections: Array<RealtimeConnection>) {
	const remaining = [...connections];
	const connect = vi.fn<RealtimeAdapter['connect']>(async () => {
		const connection = remaining.shift();
		if (!connection) throw new Error(`No ${provider} test connection remains`);
		return connection;
	});
	const adapter: RealtimeAdapter = { provider, connect };
	return { adapter, connect };
}

function createToken(
	provider: string,
	value: string,
	expiresAt: number = Date.now() + 3_600_000,
): RealtimeToken {
	return { provider, token: value, expiresAt, config: {} };
}

function createOptions(
	adapter: RealtimeAdapter,
	getToken: UseRealtimeChatOptions['getToken'],
	overrides: Partial<UseRealtimeChatOptions> = {},
): UseRealtimeChatOptions {
	return { adapter, getToken, autoCapture: false, ...overrides };
}

beforeEach(() => {
	vi.stubGlobal(
		'requestAnimationFrame',
		vi.fn(() => 1),
	);
	vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('useRealtimeChat', () => {
	it('uses updated authentication and provider on the next connection', async () => {
		const firstConnection = createConnection();
		const secondConnection = createConnection();
		const firstAdapter = createAdapter('first', [firstConnection.connection]);
		const secondAdapter = createAdapter('second', [secondConnection.connection]);
		const firstToken = createToken('first', 'first-token');
		const secondToken = createToken('second', 'second-token');
		const firstGetToken = vi.fn(async () => firstToken);
		const secondGetToken = vi.fn(async () => secondToken);

		const { result, rerender, unmount } = renderHook(
			(options: UseRealtimeChatOptions) => useRealtimeChat(options),
			{ initialProps: createOptions(firstAdapter.adapter, firstGetToken) },
		);

		await act(async () => {
			await result.current.connect();
			await result.current.disconnect();
		});

		rerender(createOptions(secondAdapter.adapter, secondGetToken));
		await act(async () => {
			await result.current.connect();
		});

		expect(firstGetToken).toHaveBeenCalledTimes(1);
		expect(firstAdapter.connect).toHaveBeenCalledTimes(1);
		expect(secondGetToken).toHaveBeenCalledTimes(1);
		expect(secondAdapter.connect).toHaveBeenCalledWith(secondToken, undefined);

		await act(async () => {
			await result.current.disconnect();
		});
		unmount();
	});

	it('uses updated authentication when refreshing an active session', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-07-16T12:00:00Z'));

		const testConnection = createConnection();
		const testAdapter = createAdapter('test', [testConnection.connection]);
		const initialToken = createToken('test', 'initial', Date.now() + 60_100);
		const staleRefreshToken = createToken('test', 'stale-refresh');
		const currentRefreshToken = createToken('test', 'current-refresh');
		const firstGetToken = vi
			.fn<UseRealtimeChatOptions['getToken']>()
			.mockResolvedValueOnce(initialToken)
			.mockResolvedValue(staleRefreshToken);
		const secondGetToken = vi.fn(async () => currentRefreshToken);

		const { result, rerender, unmount } = renderHook(
			(options: UseRealtimeChatOptions) => useRealtimeChat(options),
			{ initialProps: createOptions(testAdapter.adapter, firstGetToken) },
		);
		await act(async () => {
			await result.current.connect();
		});

		rerender(createOptions(testAdapter.adapter, secondGetToken));
		await act(async () => {
			await vi.advanceTimersByTimeAsync(101);
		});

		expect(firstGetToken).toHaveBeenCalledTimes(1);
		expect(secondGetToken).toHaveBeenCalledTimes(1);

		await act(async () => {
			await result.current.disconnect();
		});
		unmount();
	});

	it('updates the active session and preserves changes across reconnects', async () => {
		const firstConnection = createConnection();
		const secondConnection = createConnection();
		const testAdapter = createAdapter('test', [
			firstConnection.connection,
			secondConnection.connection,
		]);
		const getToken = vi.fn(async () => createToken('test', 'token'));
		const { result, unmount } = renderHook(() =>
			useRealtimeChat(createOptions(testAdapter.adapter, getToken)),
		);

		await act(async () => {
			await result.current.connect();
		});
		firstConnection.updateSession.mockClear();

		act(() => {
			result.current.updateSession({ vadMode: 'manual' });
		});
		expect(firstConnection.updateSession).toHaveBeenCalledWith(
			expect.objectContaining({ vadMode: 'manual' }),
		);

		await act(async () => {
			await result.current.disconnect();
		});
		act(() => {
			result.current.updateSession({ vadMode: 'semantic' });
		});
		await act(async () => {
			await result.current.connect();
		});

		expect(secondConnection.updateSession).toHaveBeenCalledWith(
			expect.objectContaining({ vadMode: 'semantic' }),
		);

		await act(async () => {
			await result.current.disconnect();
		});
		unmount();
	});

	it('forwards connection status to the latest callback', async () => {
		const testConnection = createConnection();
		const testAdapter = createAdapter('test', [testConnection.connection]);
		const getToken = vi.fn(async () => createToken('test', 'token'));
		const firstOnStatusChange = vi.fn();
		const secondOnStatusChange = vi.fn();
		const { result, rerender, unmount } = renderHook(
			(options: UseRealtimeChatOptions) => useRealtimeChat(options),
			{
				initialProps: createOptions(testAdapter.adapter, getToken, {
					onStatusChange: firstOnStatusChange,
				}),
			},
		);

		rerender(
			createOptions(testAdapter.adapter, getToken, {
				onStatusChange: secondOnStatusChange,
			}),
		);
		await act(async () => {
			await result.current.connect();
		});

		expect(firstOnStatusChange).not.toHaveBeenCalled();
		expect(secondOnStatusChange).toHaveBeenCalledWith('connecting');
		expect(secondOnStatusChange).toHaveBeenCalledWith('connected');

		await act(async () => {
			await result.current.disconnect();
		});
		unmount();
	});

	it('forwards usage and go-away events to the latest callbacks', async () => {
		const testConnection = createConnection();
		const testAdapter = createAdapter('test', [testConnection.connection]);
		const getToken = vi.fn(async () => createToken('test', 'token'));
		const firstOnUsage = vi.fn();
		const firstOnGoAway = vi.fn();
		const secondOnUsage = vi.fn();
		const secondOnGoAway = vi.fn();
		const { result, rerender, unmount } = renderHook(
			(options: UseRealtimeChatOptions) => useRealtimeChat(options),
			{
				initialProps: createOptions(testAdapter.adapter, getToken, {
					onUsage: firstOnUsage,
					onGoAway: firstOnGoAway,
				}),
			},
		);

		rerender(
			createOptions(testAdapter.adapter, getToken, {
				onUsage: secondOnUsage,
				onGoAway: secondOnGoAway,
			}),
		);
		await act(async () => {
			await result.current.connect();
		});

		const usage: UsageInfo = {
			promptTokens: 3,
			completionTokens: 5,
			totalTokens: 8,
		};
		act(() => {
			testConnection.emit('usage', usage);
			testConnection.emit('go_away', { timeLeft: '12s' });
		});

		expect(firstOnUsage).not.toHaveBeenCalled();
		expect(firstOnGoAway).not.toHaveBeenCalled();
		expect(secondOnUsage).toHaveBeenCalledWith(usage);
		expect(secondOnGoAway).toHaveBeenCalledWith('12s');

		await act(async () => {
			await result.current.disconnect();
		});
		unmount();
	});
});
