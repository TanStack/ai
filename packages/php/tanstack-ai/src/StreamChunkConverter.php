<?php

namespace TanStack\AI;

/**
 * Converts provider-specific streaming events to TanStack AI AG-UI StreamChunk format.
 * 
 * Implements the AG-UI (Agent-User Interaction) Protocol event types:
 * - RUN_STARTED, RUN_FINISHED, RUN_ERROR (lifecycle events)
 * - TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT, TEXT_MESSAGE_END (text streaming)
 * - TOOL_CALL_START, TOOL_CALL_ARGS, TOOL_CALL_END (tool calling)
 * - STEP_STARTED, STEP_FINISHED (thinking/reasoning)
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
    private string $accumulatedThinking = '';
    private array $toolCallsMap = [];
    private int $currentToolIndex = -1;
    private bool $runFinished = false;

    // AG-UI lifecycle tracking
    private string $runId;
    private string $messageId;
    private ?string $stepId = null;
    private bool $hasEmittedRunStarted = false;
    private bool $hasEmittedTextMessageStart = false;

    public function __construct(string $model, string $provider = 'anthropic')
    {
        $this->model = $model;
        $this->provider = strtolower($provider);
        $this->timestamp = (int)(microtime(true) * 1000);
        $this->runId = $this->generateId();
        $this->messageId = $this->generateId();
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
     * Create RUN_STARTED event if not already emitted
     */
    private function maybeEmitRunStarted(): ?array
    {
        if (!$this->hasEmittedRunStarted) {
            $this->hasEmittedRunStarted = true;
            return [
                'type' => 'RUN_STARTED',
                'runId' => $this->runId,
                'model' => $this->model,
                'timestamp' => $this->timestamp
            ];
        }
        return null;
    }

    /**
     * Create TEXT_MESSAGE_START event if not already emitted
     */
    private function maybeEmitTextMessageStart(): ?array
    {
        if (!$this->hasEmittedTextMessageStart) {
            $this->hasEmittedTextMessageStart = true;
            return [
                'type' => 'TEXT_MESSAGE_START',
                'messageId' => $this->messageId,
                'model' => $this->model,
                'timestamp' => $this->timestamp,
                'role' => 'assistant'
            ];
        }
        return null;
    }

    /**
     * Convert Anthropic streaming event to AG-UI StreamChunk format
     */
    public function convertAnthropicEvent(mixed $event): array
    {
        $chunks = [];
        $eventType = $this->getEventType($event);

        // Emit RUN_STARTED on first event
        $runStarted = $this->maybeEmitRunStarted();
        if ($runStarted) {
            $chunks[] = $runStarted;
        }

        if ($eventType === 'content_block_start') {
            $contentBlock = $this->getAttr($event, 'content_block');
            if ($contentBlock) {
                $blockType = $this->getAttr($contentBlock, 'type');
                
                if ($blockType === 'tool_use') {
                    // Tool call is starting
                    $this->currentToolIndex++;
                    $toolId = $this->getAttr($contentBlock, 'id');
                    $toolName = $this->getAttr($contentBlock, 'name');
                    
                    $this->toolCallsMap[$this->currentToolIndex] = [
                        'id' => $toolId,
                        'name' => $toolName,
                        'input' => '',
                        'started' => false
                    ];
                } elseif ($blockType === 'thinking') {
                    // Thinking/reasoning block starting
                    $this->accumulatedThinking = '';
                    $this->stepId = $this->generateId();
                    $chunks[] = [
                        'type' => 'STEP_STARTED',
                        'stepId' => $this->stepId,
                        'model' => $this->model,
                        'timestamp' => $this->timestamp,
                        'stepType' => 'thinking'
                    ];
                }
            }
        } elseif ($eventType === 'content_block_delta') {
            $delta = $this->getAttr($event, 'delta');

            if ($delta && $this->getAttr($delta, 'type') === 'text_delta') {
                // Emit TEXT_MESSAGE_START on first text content
                $textStart = $this->maybeEmitTextMessageStart();
                if ($textStart) {
                    $chunks[] = $textStart;
                }

                // Text content delta
                $deltaText = $this->getAttr($delta, 'text', '');
                $this->accumulatedContent .= $deltaText;

                $chunks[] = [
                    'type' => 'TEXT_MESSAGE_CONTENT',
                    'messageId' => $this->messageId,
                    'model' => $this->model,
                    'timestamp' => $this->timestamp,
                    'delta' => $deltaText,
                    'content' => $this->accumulatedContent
                ];
            } elseif ($delta && $this->getAttr($delta, 'type') === 'thinking_delta') {
                // Thinking content delta
                $deltaThinking = $this->getAttr($delta, 'thinking', '');
                $this->accumulatedThinking .= $deltaThinking;

                $chunks[] = [
                    'type' => 'STEP_FINISHED',
                    'stepId' => $this->stepId ?? $this->generateId(),
                    'model' => $this->model,
                    'timestamp' => $this->timestamp,
                    'delta' => $deltaThinking,
                    'content' => $this->accumulatedThinking
                ];
            } elseif ($delta && $this->getAttr($delta, 'type') === 'input_json_delta') {
                // Tool input is being streamed
                $partialJson = $this->getAttr($delta, 'partial_json', '');
                $toolCall = $this->toolCallsMap[$this->currentToolIndex] ?? null;

                if ($toolCall) {
                    // Emit TOOL_CALL_START on first args delta
                    if (!$toolCall['started']) {
                        $toolCall['started'] = true;
                        $this->toolCallsMap[$this->currentToolIndex] = $toolCall;
                        
                        $chunks[] = [
                            'type' => 'TOOL_CALL_START',
                            'toolCallId' => $toolCall['id'],
                            'toolName' => $toolCall['name'],
                            'model' => $this->model,
                            'timestamp' => $this->timestamp,
                            'index' => $this->currentToolIndex
                        ];
                    }

                    $toolCall['input'] .= $partialJson;
                    $this->toolCallsMap[$this->currentToolIndex] = $toolCall;

                    $chunks[] = [
                        'type' => 'TOOL_CALL_ARGS',
                        'toolCallId' => $toolCall['id'],
                        'model' => $this->model,
                        'timestamp' => $this->timestamp,
                        'delta' => $partialJson,
                        'args' => $toolCall['input']
                    ];
                }
            }
        } elseif ($eventType === 'content_block_stop') {
            // Content block completed
            $toolCall = $this->toolCallsMap[$this->currentToolIndex] ?? null;
            if ($toolCall) {
                // If tool call wasn't started yet (no args), start it now
                if (!$toolCall['started']) {
                    $toolCall['started'] = true;
                    $this->toolCallsMap[$this->currentToolIndex] = $toolCall;
                    
                    $chunks[] = [
                        'type' => 'TOOL_CALL_START',
                        'toolCallId' => $toolCall['id'],
                        'toolName' => $toolCall['name'],
                        'model' => $this->model,
                        'timestamp' => $this->timestamp,
                        'index' => $this->currentToolIndex
                    ];
                }

                // Parse input and emit TOOL_CALL_END
                $parsedInput = [];
                if (!empty($toolCall['input'])) {
                    try {
                        $parsedInput = json_decode($toolCall['input'], true) ?? [];
                    } catch (\Exception $e) {
                        $parsedInput = [];
                    }
                }

                $chunks[] = [
                    'type' => 'TOOL_CALL_END',
                    'toolCallId' => $toolCall['id'],
                    'toolName' => $toolCall['name'],
                    'model' => $this->model,
                    'timestamp' => $this->timestamp,
                    'input' => $parsedInput
                ];
            }

            // Emit TEXT_MESSAGE_END if we had text content
            if ($this->hasEmittedTextMessageStart && !empty($this->accumulatedContent)) {
                $chunks[] = [
                    'type' => 'TEXT_MESSAGE_END',
                    'messageId' => $this->messageId,
                    'model' => $this->model,
                    'timestamp' => $this->timestamp
                ];
            }
        } elseif ($eventType === 'message_delta') {
            // Message metadata update (includes stop_reason and usage)
            $delta = $this->getAttr($event, 'delta');
            $usage = $this->getAttr($event, 'usage');

            $stopReason = $delta ? $this->getAttr($delta, 'stop_reason') : null;
            if ($stopReason) {
                // Map Anthropic stop_reason to TanStack format
                $finishReason = match ($stopReason) {
                    'tool_use' => 'tool_calls',
                    'end_turn' => 'stop',
                    'max_tokens' => 'length',
                    default => $stopReason
                };

                $usageDict = null;
                if ($usage) {
                    $usageDict = [
                        'promptTokens' => $this->getAttr($usage, 'input_tokens', 0),
                        'completionTokens' => $this->getAttr($usage, 'output_tokens', 0),
                        'totalTokens' => ($this->getAttr($usage, 'input_tokens', 0) + $this->getAttr($usage, 'output_tokens', 0))
                    ];
                }

                // Handle max_tokens as error
                if ($stopReason === 'max_tokens') {
                    $this->runFinished = true;
                    $chunks[] = [
                        'type' => 'RUN_ERROR',
                        'runId' => $this->runId,
                        'model' => $this->model,
                        'timestamp' => $this->timestamp,
                        'error' => [
                            'message' => 'The response was cut off because the maximum token limit was reached.',
                            'code' => 'max_tokens'
                        ]
                    ];
                } else {
                    $this->runFinished = true;
                    $chunks[] = [
                        'type' => 'RUN_FINISHED',
                        'runId' => $this->runId,
                        'model' => $this->model,
                        'timestamp' => $this->timestamp,
                        'finishReason' => $finishReason,
                        'usage' => $usageDict
                    ];
                }
            }
        } elseif ($eventType === 'message_stop') {
            // Stream completed - this is a fallback if message_delta didn't emit RUN_FINISHED
            if (!$this->runFinished) {
                $this->runFinished = true;
                $chunks[] = [
                    'type' => 'RUN_FINISHED',
                    'runId' => $this->runId,
                    'model' => $this->model,
                    'timestamp' => $this->timestamp,
                    'finishReason' => 'stop'
                ];
            }
        }

        return $chunks;
    }

    /**
     * Convert OpenAI streaming event to AG-UI StreamChunk format
     */
    public function convertOpenAIEvent(mixed $event): array
    {
        $chunks = [];

        // Emit RUN_STARTED on first event
        $runStarted = $this->maybeEmitRunStarted();
        if ($runStarted) {
            $chunks[] = $runStarted;
        }

        // OpenAI events have chunk.choices[0].delta structure
        $choices = $this->getAttr($event, 'choices', []);
        $choice = !empty($choices) ? $choices[0] : $event;

        $delta = $this->getAttr($choice, 'delta');

        // Handle content delta
        if ($delta) {
            $content = $this->getAttr($delta, 'content');
            if ($content !== null) {
                // Emit TEXT_MESSAGE_START on first text content
                $textStart = $this->maybeEmitTextMessageStart();
                if ($textStart) {
                    $chunks[] = $textStart;
                }

                $this->accumulatedContent .= $content;
                $chunks[] = [
                    'type' => 'TEXT_MESSAGE_CONTENT',
                    'messageId' => $this->messageId,
                    'model' => $this->getAttr($event, 'model', $this->model),
                    'timestamp' => $this->timestamp,
                    'delta' => $content,
                    'content' => $this->accumulatedContent
                ];
            }

            // Handle tool calls
            $toolCalls = $this->getAttr($delta, 'tool_calls');
            if ($toolCalls) {
                foreach ($toolCalls as $index => $toolCall) {
                    $toolIndex = $this->getAttr($toolCall, 'index', $index);
                    $toolId = $this->getAttr($toolCall, 'id');
                    $function = $this->getAttr($toolCall, 'function', []);
                    $toolName = $this->getAttr($function, 'name', '');
                    $arguments = $this->getAttr($function, 'arguments', '');

                    // Initialize tool call tracking if new
                    if (!isset($this->toolCallsMap[$toolIndex])) {
                        $this->toolCallsMap[$toolIndex] = [
                            'id' => $toolId ?? ('call_' . $this->timestamp . '_' . $toolIndex),
                            'name' => $toolName,
                            'input' => '',
                            'started' => false
                        ];
                    }

                    $tracked = &$this->toolCallsMap[$toolIndex];
                    
                    // Update tool ID and name if provided
                    if ($toolId) {
                        $tracked['id'] = $toolId;
                    }
                    if ($toolName) {
                        $tracked['name'] = $toolName;
                    }

                    // Emit TOOL_CALL_START on first encounter
                    if (!$tracked['started'] && ($toolId || $toolName)) {
                        $tracked['started'] = true;
                        $chunks[] = [
                            'type' => 'TOOL_CALL_START',
                            'toolCallId' => $tracked['id'],
                            'toolName' => $tracked['name'],
                            'model' => $this->getAttr($event, 'model', $this->model),
                            'timestamp' => $this->timestamp,
                            'index' => $toolIndex
                        ];
                    }

                    // Accumulate arguments
                    if ($arguments) {
                        $tracked['input'] .= $arguments;
                        $chunks[] = [
                            'type' => 'TOOL_CALL_ARGS',
                            'toolCallId' => $tracked['id'],
                            'model' => $this->getAttr($event, 'model', $this->model),
                            'timestamp' => $this->timestamp,
                            'delta' => $arguments,
                            'args' => $tracked['input']
                        ];
                    }
                }
            }
        }

        // Handle completion
        $finishReason = $this->getAttr($choice, 'finish_reason');
        if ($finishReason) {
            // Emit TOOL_CALL_END for all pending tool calls
            foreach ($this->toolCallsMap as $toolCall) {
                if ($toolCall['started']) {
                    $parsedInput = [];
                    if (!empty($toolCall['input'])) {
                        try {
                            $parsedInput = json_decode($toolCall['input'], true) ?? [];
                        } catch (\Exception $e) {
                            $parsedInput = [];
                        }
                    }

                    $chunks[] = [
                        'type' => 'TOOL_CALL_END',
                        'toolCallId' => $toolCall['id'],
                        'toolName' => $toolCall['name'],
                        'model' => $this->getAttr($event, 'model', $this->model),
                        'timestamp' => $this->timestamp,
                        'input' => $parsedInput
                    ];
                }
            }

            // Emit TEXT_MESSAGE_END if we had text content
            if ($this->hasEmittedTextMessageStart) {
                $chunks[] = [
                    'type' => 'TEXT_MESSAGE_END',
                    'messageId' => $this->messageId,
                    'model' => $this->getAttr($event, 'model', $this->model),
                    'timestamp' => $this->timestamp
                ];
            }

            $usage = $this->getAttr($event, 'usage');
            $usageDict = null;
            if ($usage) {
                $usageDict = [
                    'promptTokens' => $this->getAttr($usage, 'prompt_tokens', 0),
                    'completionTokens' => $this->getAttr($usage, 'completion_tokens', 0),
                    'totalTokens' => $this->getAttr($usage, 'total_tokens', 0)
                ];
            }

            // Map OpenAI finish reasons
            $mappedFinishReason = match ($finishReason) {
                'stop' => 'stop',
                'length' => 'length',
                'tool_calls' => 'tool_calls',
                'content_filter' => 'content_filter',
                default => $finishReason
            };

            $this->runFinished = true;
            $chunks[] = [
                'type' => 'RUN_FINISHED',
                'runId' => $this->runId,
                'model' => $this->getAttr($event, 'model', $this->model),
                'timestamp' => $this->timestamp,
                'finishReason' => $mappedFinishReason,
                'usage' => $usageDict
            ];
        }

        return $chunks;
    }

    /**
     * Convert provider streaming event to AG-UI StreamChunk format.
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
            if (in_array($eventType, ['content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop'])) {
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
     * Convert an error to RUN_ERROR StreamChunk format (AG-UI Protocol)
     */
    public function convertError(\Throwable $error): array
    {
        // Ensure RUN_STARTED was emitted before error
        $chunks = [];
        $runStarted = $this->maybeEmitRunStarted();
        if ($runStarted) {
            $chunks[] = $runStarted;
        }

        $chunks[] = [
            'type' => 'RUN_ERROR',
            'runId' => $this->runId,
            'model' => $this->model,
            'timestamp' => $this->timestamp,
            'error' => [
                'message' => $error->getMessage(),
                'code' => (string)$error->getCode()
            ]
        ];

        return $chunks;
    }
}

