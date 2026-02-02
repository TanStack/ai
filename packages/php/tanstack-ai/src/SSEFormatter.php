<?php

namespace TanStack\AI;

/**
 * Server-Sent Events (SSE) formatting utilities for TanStack AI
 * 
 * Provides utilities for formatting StreamChunk objects into SSE-compatible
 * event stream format for HTTP responses.
 */
class SSEFormatter
{
    /**
     * Format a StreamChunk array as an SSE data line.
     * 
     * @param array $chunk StreamChunk array to format
     * @return string SSE-formatted string (e.g., "data: {...}\n\n")
     */
    public static function formatChunk(array $chunk): string
    {
        return "data: " . json_encode($chunk, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n\n";
    }

    /**
     * Format the SSE completion marker.
     * 
     * @return string SSE completion marker (e.g., "data: [DONE]\n\n")
     */
    public static function formatDone(): string
    {
        return "data: [DONE]\n\n";
    }

    /**
     * Format an error as an SSE RUN_ERROR chunk (AG-UI Protocol).
     * 
     * @param \Throwable $error Exception to format
     * @param string|null $runId Optional run ID for correlation
     * @param string|null $model Optional model name
     * @return string SSE-formatted RUN_ERROR chunk
     */
    public static function formatError(\Throwable $error, ?string $runId = null, ?string $model = null): string
    {
        $errorChunk = [
            'type' => 'RUN_ERROR',
            'runId' => $runId ?? ('run-' . bin2hex(random_bytes(4))),
            'model' => $model,
            'timestamp' => (int)(microtime(true) * 1000),
            'error' => [
                'message' => $error->getMessage(),
                'code' => (string)$error->getCode()
            ]
        ];
        return self::formatChunk($errorChunk);
    }
}

