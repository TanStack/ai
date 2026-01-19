<?php

namespace TanStack\AI;

/**
 * Converts provider-specific streaming events to TanStack AI StreamChunk format.
 * 
 * Supports:
 * - Anthropic streaming events
 * - OpenAI streaming events
 */
class StreamChunkConverter
{
    private string $model;
    private string $provider;
    private int $timestamp;
    private string $accumulatedContent = '';
    private array $toolCallsMap = [];
    private int $currentToolIndex = -1;
    private bool $doneEmitted = false;

    public function __construct(string $model, string $provider = 'anthropic')
    {
        $this->model = $model;
        $this->provider = strtolower($provider);
        $this->timestamp = (int)(microtime(true) * 1000);
    }

    /**
     * Generate a unique ID for the chunk
     */
    public function generateId(): string
    {
        return 'chatcmpl-' . bin2hex(random_bytes(4));
    }

    /**
     * Get event type from either array or object
     */
    private function getEventType(mixed $event): string
    {
        if (is_array($event)) {
            return $event['type'] ?? '';
        }
        return is_object($event) && property_exists($event, 'type') ? $event->type : '';
    }

    /**
     * Get attribute from either array or object
     */
    private function getAttr(mixed $obj, string $attr, mixed $default = null): mixed
    {
        if (is_array($obj)) {
            return $obj[$attr] ?? $default;
        }
        if (is_object($obj)) {
            return property_exists($obj, $attr) ? $obj->$attr : $default;
        }
        return $default;
    }

    /**
     * Convert Anthropic streaming event to StreamChunk format
     */
    public function convertAnthropicEvent(mixed $event): array
    {
        $chunks = [];
        
        // CRITICAL: Normalize event to array first - Anthropic SDK returns objects
        // that may have different property access patterns
        if (is_object($event)) {
            $event = json_decode(json_encode($event), true);
        }
        
        $eventType = $this->getEventType($event);
        
        // Log the event being processed
        error_log('[StreamChunkConverter] convertAnthropicEvent: processing event type=' . $eventType . ', data=' . json_encode($event));

        if ($eventType === 'content_block_start') {
            // Tool call is starting
            $contentBlock = $this->getAttr($event, 'content_block');
            $index = $this->getAttr($event, 'index', -1);
            
            error_log('[StreamChunkConverter] content_block_start: contentBlock=' . json_encode($contentBlock) . ', index=' . $index);
            
            $blockType = $contentBlock ? $this->getAttr($contentBlock, 'type') : null;
            error_log('[StreamChunkConverter] content_block_start: blockType=' . ($blockType ?? 'null'));
            
            if ($contentBlock && $blockType === 'tool_use') {
                // Use the index from the event, not an incrementing counter
                $toolId = $this->getAttr($contentBlock, 'id');
                $toolName = $this->getAttr($contentBlock, 'name');
                
                $this->toolCallsMap[$index] = [
                    'id' => $toolId,
                    'name' => $toolName,
                    'input' => ''
                ];
                error_log('[StreamChunkConverter] content_block_start: initialized tool call at index=' . $index . ', id=' . $toolId . ', name=' . $toolName);
                error_log('[StreamChunkConverter] content_block_start: toolCallsMap now has keys=' . json_encode(array_keys($this->toolCallsMap)));
            } else {
                error_log('[StreamChunkConverter] content_block_start: NOT a tool_use block, skipping');
            }
        } elseif ($eventType === 'content_block_delta') {
            $delta = $this->getAttr($event, 'delta');
            $index = $this->getAttr($event, 'index', -1); // Get index from event

            if ($delta && $this->getAttr($delta, 'type') === 'text_delta') {
                // Text content delta
                $deltaText = $this->getAttr($delta, 'text', '');
                $this->accumulatedContent .= $deltaText;

                $chunks[] = [
                    'type' => 'content',
                    'id' => $this->generateId(),
                    'model' => $this->model,
                    'timestamp' => $this->timestamp,
                    'delta' => $deltaText,
                    'content' => $this->accumulatedContent,
                    'role' => 'assistant'
                ];
            } elseif ($delta && $this->getAttr($delta, 'type') === 'input_json_delta') {
                // Tool input is being streamed
                $partialJson = $this->getAttr($delta, 'partial_json', '');
                error_log('[StreamChunkConverter] content_block_delta input_json_delta: index=' . $index . ', partial_json=' . $partialJson);
                error_log('[StreamChunkConverter] content_block_delta: toolCallsMap keys=' . json_encode(array_keys($this->toolCallsMap)));
                
                $toolCall = $this->toolCallsMap[$index] ?? null;

                if ($toolCall) {
                    $toolCall['input'] .= $partialJson;
                    $this->toolCallsMap[$index] = $toolCall;
                    
                    error_log('[StreamChunkConverter] content_block_delta: emitting tool_call chunk, accumulated input=' . $toolCall['input']);

                    $chunks[] = [
                        'type' => 'tool_call',
                        'id' => $this->generateId(),
                        'model' => $this->model,
                        'timestamp' => $this->timestamp,
                        'toolCall' => [
                            'id' => $toolCall['id'],
                            'type' => 'function',
                            'function' => [
                                'name' => $toolCall['name'],
                                'arguments' => $toolCall['input'] // Use accumulated input, not just partial
                            ]
                        ],
                        'index' => $index
                    ];
                } else {
                    error_log('[StreamChunkConverter] content_block_delta: ERROR - no tool call found at index=' . $index);
                }
            }
        } elseif ($eventType === 'content_block_stop') {
            // Tool call block is complete - emit final tool_call chunk with complete input
            $index = $this->getAttr($event, 'index', -1);
            $toolCall = $this->toolCallsMap[$index] ?? null;
            
            if ($toolCall && !empty($toolCall['input'])) {
                error_log('[StreamChunkConverter] content_block_stop: emitting final tool_call chunk for index=' . $index . ', complete input=' . $toolCall['input']);
                
                $chunks[] = [
                    'type' => 'tool_call',
                    'id' => $this->generateId(),
                    'model' => $this->model,
                    'timestamp' => $this->timestamp,
                    'toolCall' => [
                        'id' => $toolCall['id'],
                        'type' => 'function',
                        'function' => [
                            'name' => $toolCall['name'],
                            'arguments' => $toolCall['input'] // Complete accumulated input
                        ]
                    ],
                    'index' => $index
                ];
            }
        } elseif ($eventType === 'message_delta') {
            // Message metadata update (includes stop_reason and usage)
            $delta = $this->getAttr($event, 'delta');
            $usage = $this->getAttr($event, 'usage');

            error_log('[StreamChunkConverter] message_delta: delta=' . json_encode($delta) . ', usage=' . json_encode($usage));

            $stopReason = $delta ? $this->getAttr($delta, 'stop_reason') : null;
            error_log('[StreamChunkConverter] message_delta: stopReason=' . ($stopReason ?? 'null'));
            
            if ($stopReason) {
                // Map Anthropic stop_reason to TanStack format
                $finishReason = match ($stopReason) {
                    'tool_use' => 'tool_calls',
                    'end_turn' => 'stop',
                    default => $stopReason
                };

                error_log('[StreamChunkConverter] message_delta: mapped finishReason=' . $finishReason);

                $usageDict = null;
                if ($usage) {
                    $usageDict = [
                        'promptTokens' => $this->getAttr($usage, 'input_tokens', 0),
                        'completionTokens' => $this->getAttr($usage, 'output_tokens', 0),
                        'totalTokens' => ($this->getAttr($usage, 'input_tokens', 0) + $this->getAttr($usage, 'output_tokens', 0))
                    ];
                }

                $this->doneEmitted = true;
                $chunks[] = [
                    'type' => 'done',
                    'id' => $this->generateId(),
                    'model' => $this->model,
                    'timestamp' => $this->timestamp,
                    'finishReason' => $finishReason,
                    'usage' => $usageDict
                ];
                error_log('[StreamChunkConverter] message_delta: emitted done chunk with finishReason=' . $finishReason);
            } else {
                error_log('[StreamChunkConverter] message_delta: no stopReason, not emitting done chunk');
            }
        } elseif ($eventType === 'message_stop') {
            // Stream completed - this is a fallback if message_delta didn't emit done
            if (!$this->doneEmitted) {
                $this->doneEmitted = true;
                $chunks[] = [
                    'type' => 'done',
                    'id' => $this->generateId(),
                    'model' => $this->model,
                    'timestamp' => $this->timestamp,
                    'finishReason' => 'stop'
                ];
            }
        }

        return $chunks;
    }

    /**
     * Convert OpenAI streaming event to StreamChunk format
     */
    public function convertOpenAIEvent(mixed $event): array
    {
        $chunks = [];

        // OpenAI events have chunk.choices[0].delta structure
        $choices = $this->getAttr($event, 'choices', []);
        $choice = !empty($choices) ? $choices[0] : $event;

        $delta = $this->getAttr($choice, 'delta');

        // Handle content delta
        if ($delta) {
            $content = $this->getAttr($delta, 'content');
            if ($content !== null) {
                $this->accumulatedContent .= $content;
                $chunks[] = [
                    'type' => 'content',
                    'id' => $this->getAttr($event, 'id', $this->generateId()),
                    'model' => $this->getAttr($event, 'model', $this->model),
                    'timestamp' => $this->timestamp,
                    'delta' => $content,
                    'content' => $this->accumulatedContent,
                    'role' => 'assistant'
                ];
            }

            // Handle tool calls
            $toolCalls = $this->getAttr($delta, 'tool_calls');
            if ($toolCalls) {
                foreach ($toolCalls as $index => $toolCall) {
                    $function = $this->getAttr($toolCall, 'function', []);
                    $chunks[] = [
                        'type' => 'tool_call',
                        'id' => $this->getAttr($event, 'id', $this->generateId()),
                        'model' => $this->getAttr($event, 'model', $this->model),
                        'timestamp' => $this->timestamp,
                        'toolCall' => [
                            'id' => $this->getAttr($toolCall, 'id', 'call_' . $this->timestamp),
                            'type' => 'function',
                            'function' => [
                                'name' => $this->getAttr($function, 'name', ''),
                                'arguments' => $this->getAttr($function, 'arguments', '')
                            ]
                        ],
                        'index' => $this->getAttr($toolCall, 'index', $index)
                    ];
                }
            }
        }

        // Handle completion
        $finishReason = $this->getAttr($choice, 'finish_reason');
        if ($finishReason) {
            $usage = $this->getAttr($event, 'usage');
            $usageDict = null;
            if ($usage) {
                $usageDict = [
                    'promptTokens' => $this->getAttr($usage, 'prompt_tokens', 0),
                    'completionTokens' => $this->getAttr($usage, 'completion_tokens', 0),
                    'totalTokens' => $this->getAttr($usage, 'total_tokens', 0)
                ];
            }

            $this->doneEmitted = true;
            $chunks[] = [
                'type' => 'done',
                'id' => $this->getAttr($event, 'id', $this->generateId()),
                'model' => $this->getAttr($event, 'model', $this->model),
                'timestamp' => $this->timestamp,
                'finishReason' => $finishReason,
                'usage' => $usageDict
            ];
        }

        return $chunks;
    }

    /**
     * Convert provider streaming event to StreamChunk format.
     * Automatically detects provider based on event structure.
     */
    public function convertEvent(mixed $event): array
    {
        if ($this->provider === 'anthropic') {
            return $this->convertAnthropicEvent($event);
        } elseif ($this->provider === 'openai') {
            return $this->convertOpenAIEvent($event);
        } else {
            // Try to auto-detect based on event structure
            $eventType = $this->getEventType($event);

            // Anthropic events have types like "content_block_start", "message_delta"
            // OpenAI events have chunk.choices structure
            if (in_array($eventType, ['content_block_start', 'content_block_delta', 'message_delta', 'message_stop'])) {
                return $this->convertAnthropicEvent($event);
            } elseif ($this->getAttr($event, 'choices') !== null) {
                return $this->convertOpenAIEvent($event);
            } else {
                // Default to Anthropic format
                return $this->convertAnthropicEvent($event);
            }
        }
    }

    /**
     * Convert an error to ErrorStreamChunk format
     */
    public function convertError(\Throwable $error): array
    {
        return [
            'type' => 'error',
            'id' => $this->generateId(),
            'model' => $this->model,
            'timestamp' => $this->timestamp,
            'error' => [
                'message' => $error->getMessage(),
                'code' => $error->getCode()
            ]
        ];
    }
}

