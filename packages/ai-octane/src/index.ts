export { useChat } from './use-chat.tsrx';
export { useRealtimeChat } from './use-realtime-chat.tsrx';
export { useMcpAppBridge } from './use-mcp-app-bridge.tsrx';
export type { UseMcpAppBridgeOptions } from './use-mcp-app-bridge.tsrx';
export type {
	DeepPartial,
	UseChatOptions,
	UseChatReturn,
	UIMessage,
	ChatRequestBody,
} from './types';
export type { UseRealtimeChatOptions, UseRealtimeChatReturn } from './realtime-types';

export { useGeneration } from './use-generation.tsrx';
export type { UseGenerationOptions, UseGenerationReturn } from './use-generation.tsrx';
export { useGenerateImage } from './use-generate-image.tsrx';
export type { UseGenerateImageOptions, UseGenerateImageReturn } from './use-generate-image.tsrx';
export { useGenerateAudio } from './use-generate-audio.tsrx';
export type { UseGenerateAudioOptions, UseGenerateAudioReturn } from './use-generate-audio.tsrx';
export { useGenerateSpeech } from './use-generate-speech.tsrx';
export type { UseGenerateSpeechOptions, UseGenerateSpeechReturn } from './use-generate-speech.tsrx';
export { useTranscription } from './use-transcription.tsrx';
export type { UseTranscriptionOptions, UseTranscriptionReturn } from './use-transcription.tsrx';
export { useSummarize } from './use-summarize.tsrx';
export type { UseSummarizeOptions, UseSummarizeReturn } from './use-summarize.tsrx';
export { useGenerateVideo } from './use-generate-video.tsrx';
export type { UseGenerateVideoOptions, UseGenerateVideoReturn } from './use-generate-video.tsrx';
export { useAudioRecorder } from './use-audio-recorder.tsrx';
export type { UseAudioRecorderOptions, UseAudioRecorderReturn } from './use-audio-recorder.tsrx';

// Re-export from ai-client for convenience (mirror upstream index.ts)
export {
	fetchServerSentEvents,
	fetchHttpStream,
	xhrServerSentEvents,
	xhrHttpStream,
	stream,
	rpcStream,
	createChatClientOptions,
	createMcpAppBridge,
	type McpAppBridge,
	type CreateMcpAppBridgeOptions,
	type ChatFetcher,
	type ChatFetcherInput,
	type ChatFetcherOptions,
	type ConnectionAdapter,
	type ConnectConnectionAdapter,
	type SubscribeConnectionAdapter,
	type RunAgentInputContext,
	type FetchConnectionOptions,
	type XhrConnectionOptions,
	type InferChatMessages,
	type GenerationClientState,
	type ImageGenerateInput,
	type AudioGenerateInput,
	type SpeechGenerateInput,
	type TranscriptionGenerateInput,
	type SummarizeGenerateInput,
	type VideoGenerateInput,
	type VideoGenerateResult,
	type VideoStatusInfo,
} from '@tanstack/ai-client';
