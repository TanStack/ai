<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Tools\GetInventoryTool;
use Illuminate\Http\Request;
use TanStack\AI\AgentLoopStrategies;
use TanStack\AI\ChatEngine;
use TanStack\AI\SSEFormatter;
use TanStack\AI\Tool;

class ChatController extends Controller
{
    /**
     * Handle chat streaming requests with agentic flow support
     */
    public function chat(Request $request)
    {
        $messages = $request->input('messages', []);
        $data = $request->input('data', []);
        $provider = $data['provider'] ?? 'anthropic';
        $model = $data['model'] ?? ($provider === 'anthropic' ? 'claude-3-haiku-20240307' : 'gpt-4o');
        
        // Get tools from request
        $toolsData = $request->input('tools', []);
        $tools = $this->parseTools($toolsData);
        
        // Get agent loop strategy (optional)
        $maxIterations = $data['maxIterations'] ?? 5;
        $loopStrategy = AgentLoopStrategies::maxIterations($maxIterations);
        
        // Get system prompts (optional)
        $systemPrompts = $data['systemPrompts'] ?? [];

        try {
            // Use stream() instead of eventStream() to avoid Laravel adding 'event:' lines
            // TanStack AI client expects only 'data:' lines (no event names)
            return response()->stream(function () use ($provider, $model, $messages, $tools, $loopStrategy, $systemPrompts) {
                // Disable output buffering for streaming
                if (ob_get_level() > 0) {
                    ob_end_clean();
                }

                try {
                    // Get API keys for ChatEngine
                    $anthropicApiKey = config('services.anthropic.key');
                    $openaiApiKey = config('services.openai.api_key');
                    
                    // Create ChatEngine instance
                    $engine = new ChatEngine(
                        provider: $provider,
                        model: $model,
                        messages: $messages,
                        tools: $tools,
                        loopStrategy: $loopStrategy,
                        systemPrompts: $systemPrompts,
                        anthropicApiKey: $anthropicApiKey,
                        openaiApiKey: $openaiApiKey
                    );

                    // Stream chunks from the engine
                    foreach ($engine->chat() as $chunk) {
                        $chunkData = SSEFormatter::formatChunk($chunk);
                        echo $chunkData;
                        if (ob_get_level() > 0) {
                            ob_flush();
                        }
                        flush();
                    }

                    // Send [DONE] marker
                    $done = SSEFormatter::formatDone();
                    echo $done;
                    if (ob_get_level() > 0) {
                        ob_flush();
                    }
                    flush();
                } catch (\Throwable $e) {
                    // Log error to console/error log
                    error_log('ChatController streaming error: ' . $e->getMessage());
                    error_log('File: ' . $e->getFile() . ':' . $e->getLine());
                    error_log('Trace: ' . $e->getTraceAsString());
                    
                    // Convert error to error chunk
                    $errorChunk = [
                        'type' => 'error',
                        'id' => 'error-' . time(),
                        'model' => $model,
                        'timestamp' => (int)(microtime(true) * 1000),
                        'error' => [
                            'message' => $e->getMessage(),
                            'code' => $e->getCode(),
                        ],
                    ];
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
     * Parse tools from request data.
     * Supports both Tool objects and tool definition arrays.
     * 
     * @param array $toolsData Tools data from request
     * @return array<Tool> Array of Tool objects
     */
    private function parseTools(array $toolsData): array
    {
        $tools = [];
        
        // If tools array is empty, add default getInventory tool
        if (empty($toolsData)) {
            $tools[] = GetInventoryTool::create();
            return $tools;
        }
        
        foreach ($toolsData as $toolData) {
            if ($toolData instanceof Tool) {
                $tools[] = $toolData;
            } elseif (is_array($toolData)) {
                // Check if it's a tool name string (like 'getInventory')
                if (isset($toolData['name']) && $toolData['name'] === 'getInventory') {
                    $tools[] = GetInventoryTool::create();
                } else {
                    // Convert array to Tool object
                    $tools[] = Tool::fromArray($toolData);
                }
            } elseif (is_string($toolData) && $toolData === 'getInventory') {
                // Simple string reference to built-in tool
                $tools[] = GetInventoryTool::create();
            }
        }
        
        return $tools;
    }
}
