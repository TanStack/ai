<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use TanStack\AI\StreamChunkConverter;
use TanStack\AI\MessageFormatters;
use TanStack\AI\SSEFormatter;
use Anthropic\Client as AnthropicClient;
use OpenAI\Factory;

class ChatController extends Controller
{
    /**
     * Handle chat streaming requests
     */
    public function chat(Request $request)
    {
        $messages = $request->input('messages', []);
        $data = $request->input('data', []);
        $provider = $data['provider'] ?? 'anthropic';
        $model = $data['model'] ?? ($provider === 'anthropic' ? 'claude-3-haiku-20240307' : 'gpt-4o');

        try {
            // Use stream() instead of eventStream() to avoid Laravel adding 'event:' lines
            // TanStack AI client expects only 'data:' lines (no event names)
            return response()->stream(function () use ($provider, $model, $messages) {
                // Disable output buffering for streaming
                if (ob_get_level() > 0) {
                    ob_end_clean();
                }
                
                $converter = new StreamChunkConverter(model: $model, provider: $provider);

                try {
                    if ($provider === 'anthropic') {
                        foreach ($this->streamAnthropic($converter, $model, $messages) as $chunk) {
                            echo $chunk;
                            if (ob_get_level() > 0) {
                                ob_flush();
                            }
                            flush();
                        }
                    } else {
                        foreach ($this->streamOpenAI($converter, $model, $messages) as $chunk) {
                            echo $chunk;
                            if (ob_get_level() > 0) {
                                ob_flush();
                            }
                            flush();
                        }
                    }

                    // Send [DONE] marker
                    $done = SSEFormatter::formatDone();
                    echo $done;
                    if (ob_get_level() > 0) {
                        ob_flush();
                    }
                    flush();
                } catch (\Throwable $e) {
                    // Convert error to error chunk
                    $errorChunk = $converter->convertError($e);
                    $errorData = SSEFormatter::formatChunk($errorChunk);
                    echo $errorData;
                    if (ob_get_level() > 0) {
                        ob_flush();
                    }
                    flush();
                }
            }, 200, [
                'Content-Type' => 'text/event-stream',
                'Cache-Control' => 'no-cache',
                'Connection' => 'keep-alive',
                'X-Accel-Buffering' => 'no',
                'Access-Control-Allow-Origin' => 'http://localhost:3200',
                'Access-Control-Allow-Credentials' => 'true',
                'Access-Control-Allow-Methods' => 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers' => 'Content-Type, Authorization, X-Requested-With',
            ]);
        } catch (\Throwable $e) {
            // If eventStream itself fails, return JSON error response
            \Log::error('ChatController error: ' . $e->getMessage(), [
                'exception' => $e,
                'trace' => $e->getTraceAsString()
            ]);
            
            return response()->json([
                'error' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ], 500);
        }
    }

    /**
     * Stream from Anthropic API
     */
    private function streamAnthropic(StreamChunkConverter $converter, string $model, array $messages): \Generator
    {
        [$systemMessage, $anthropicMessages] = MessageFormatters::formatMessagesForAnthropic($messages);

        $apiKey = config('services.anthropic.key');
        if (!$apiKey) {
            throw new \RuntimeException('ANTHROPIC_API_KEY is not configured');
        }

        $client = new AnthropicClient(apiKey: $apiKey);

        $streamParams = [
            'maxTokens' => 1024,
            'messages' => $anthropicMessages,
            'model' => $model,
            'temperature' => 0.7,
        ];

        if ($systemMessage) {
            $streamParams['system'] = $systemMessage;
        }

        $stream = $client->messages->createStream(...$streamParams);

        foreach ($stream as $event) {
            $chunks = $converter->convertEvent($event);

            foreach ($chunks as $chunk) {
                yield SSEFormatter::formatChunk($chunk);
            }
        }
    }

    /**
     * Stream from OpenAI API
     */
    private function streamOpenAI(StreamChunkConverter $converter, string $model, array $messages): \Generator
    {
        $openaiMessages = MessageFormatters::formatMessagesForOpenAI($messages);

        $apiKey = config('services.openai.api_key');
        if (!$apiKey) {
            throw new \RuntimeException('OPENAI_API_KEY is not configured');
        }

        $client = (new Factory())->withApiKey($apiKey)->make();

        $stream = $client->chat()->createStreamed([
            'model' => $model,
            'messages' => $openaiMessages,
            'max_tokens' => 1024,
            'temperature' => 0.7,
        ]);

        foreach ($stream as $event) {
            $chunks = $converter->convertEvent($event);

            foreach ($chunks as $chunk) {
                yield SSEFormatter::formatChunk($chunk);
            }
        }
    }
}
