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
     * Format an error as an SSE error chunk.
     * 
     * @param \Throwable $error Exception to format
     * @return string SSE-formatted error chunk
     */
    public static function formatError(\Throwable $error): string
    {
        $errorChunk = [
            'type' => 'error',
            'error' => [
                'type' => get_class($error),
                'message' => $error->getMessage()
            ]
        ];
        return self::formatChunk($errorChunk);
    }
}

