<?php

namespace TanStack\AI;

/**
 * Converts provider-specific streaming events to TanStack AI AG-UI event format.
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
    
    // AG-UI lifecycle tracking
    private string $runId;
    private string $messageId;
    private bool $runStartedEmitted = false;
    private bool $textMessageStarted = false;

    public function __construct(string $model, string $provider = 'anthropic')
    {
        $this->model = $model;
        $this->provider = strtolower($provider);
        $this->timestamp = (int)(microtime(true) * 1000);
        $this->runId = $this->generateId();
        $this->messageId = $this->generateId();
    }

    /**
     * Generate a unique ID for the event
     */
    public function generateId(): string
    {
        return 'evt-' . bin2hex(random_bytes(4));
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
     * Safely parse JSON string
     */
    private function safeJsonParse(string $json): mixed
    {
        try {
            return json_decode($json, true) ?? $json;
        } catch (\Exception $e) {
            return $json;
        }
    }

    /**
     * Convert Anthropic streaming event to AG-UI event format
     */
    public function convertAnthropicEvent(mixed $event): array
    {
        $chunks = [];
        $eventType = $this->getEventType($event);

        // Emit RUN_STARTED on first event
        if (!$this->runStartedEmitted) {
            $this->runStartedEmitted = true;
            $chunks[] = [
                'type' => 'RUN_STARTED',
                'runId' => $this->runId,
                'model' => $this->model,
                'timestamp' => $this->timestamp,
            ];
        }

        if ($eventType === 'content_block_start') {
            // Tool call is starting
            $contentBlock = $this->getAttr($event, 'content_block');
            if ($contentBlock && $this->getAttr($contentBlock, 'type') === 'tool_use') {
                $this->currentToolIndex++;
                $toolCallId = $this->getAttr($contentBlock, 'id');
                $toolName = $this->getAttr($contentBlock, 'name');
                $this->toolCallsMap[$this->currentToolIndex] = [
                    'id' => $toolCallId,
                    'name' => $toolName,
                    'input' => ''
                ];
                
                // Emit TOOL_CALL_START
                $chunks[] = [
                    'type' => 'TOOL_CALL_START',
                    'toolCallId' => $toolCallId,
                    'toolName' => $toolName,
                    'model' => $this->model,
                    'timestamp' => $this->timestamp,
                    'index' => $this->currentToolIndex,
                ];
            }
        } elseif ($eventType === 'content_block_delta') {
            $delta = $this->getAttr($event, 'delta');

            if ($delta && $this->getAttr($delta, 'type') === 'text_delta') {
                // Emit TEXT_MESSAGE_START on first text
                if (!$this->textMessageStarted) {
                    $this->textMessageStarted = true;
                    $chunks[] = [
                        'type' => 'TEXT_MESSAGE_START',
                        'messageId' => $this->messageId,
                        'model' => $this->model,
                        'timestamp' => $this->timestamp,
                        'role' => 'assistant',
                    ];
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
                    'content' => $this->accumulatedContent,
                ];
            } elseif ($delta && $this->getAttr($delta, 'type') === 'input_json_delta') {
                // Tool input is being streamed
                $partialJson = $this->getAttr($delta, 'partial_json', '');
                $toolCall = $this->toolCallsMap[$this->currentToolIndex] ?? null;

                if ($toolCall) {
                    $toolCall['input'] .= $partialJson;
                    $this->toolCallsMap[$this->currentToolIndex] = $toolCall;

                    // Emit TOOL_CALL_ARGS
                    $chunks[] = [
                        'type' => 'TOOL_CALL_ARGS',
                        'toolCallId' => $toolCall['id'],
                        'model' => $this->model,
                        'timestamp' => $this->timestamp,
                        'delta' => $partialJson,
                        'args' => $toolCall['input'],
                    ];
                }
            }
        } elseif ($eventType === 'content_block_stop') {
            // Emit TEXT_MESSAGE_END if we had text content
            if ($this->textMessageStarted && $this->accumulatedContent) {
                $chunks[] = [
                    'type' => 'TEXT_MESSAGE_END',
                    'messageId' => $this->messageId,
                    'model' => $this->model,
                    'timestamp' => $this->timestamp,
                ];
            }
            
            // Emit TOOL_CALL_END for tool calls
            $toolCall = $this->toolCallsMap[$this->currentToolIndex] ?? null;
            if ($toolCall) {
                $chunks[] = [
                    'type' => 'TOOL_CALL_END',
                    'toolCallId' => $toolCall['id'],
                    'toolName' => $toolCall['name'],
                    'model' => $this->model,
                    'timestamp' => $this->timestamp,
                    'input' => $this->safeJsonParse($toolCall['input'] ?: '{}'),
                ];
            }
        } elseif ($eventType === 'message_delta') {
            // Message metadata update (includes stop_reason and usage)
            $delta = $this->getAttr($event, 'delta');
            $usage = $this->getAttr($event, 'usage');

            $stopReason = $delta ? $this->getAttr($delta, 'stop_reason') : null;
            if ($stopReason) {
                // Map Anthropic stop_reason to AG-UI format
                $finishReason = match ($stopReason) {
                    'tool_use' => 'tool_calls',
                    'end_turn' => 'stop',
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

                $this->doneEmitted = true;
                $chunks[] = [
                    'type' => 'RUN_FINISHED',
                    'runId' => $this->runId,
                    'model' => $this->model,
                    'timestamp' => $this->timestamp,
                    'finishReason' => $finishReason,
                    'usage' => $usageDict
                ];
            }
        } elseif ($eventType === 'message_stop') {
            // Stream completed - this is a fallback if message_delta didn't emit done
            if (!$this->doneEmitted) {
                $this->doneEmitted = true;
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
     * Convert OpenAI streaming event to AG-UI event format
     */
    public function convertOpenAIEvent(mixed $event): array
    {
        $chunks = [];

        // Emit RUN_STARTED on first event
        if (!$this->runStartedEmitted) {
            $this->runStartedEmitted = true;
            $chunks[] = [
                'type' => 'RUN_STARTED',
                'runId' => $this->runId,
                'model' => $this->model,
                'timestamp' => $this->timestamp,
            ];
        }

        // OpenAI events have chunk.choices[0].delta structure
        $choices = $this->getAttr($event, 'choices', []);
        $choice = !empty($choices) ? $choices[0] : $event;

        $delta = $this->getAttr($choice, 'delta');

        // Handle content delta
        if ($delta) {
            $content = $this->getAttr($delta, 'content');
            if ($content !== null) {
                // Emit TEXT_MESSAGE_START on first text
                if (!$this->textMessageStarted) {
                    $this->textMessageStarted = true;
                    $chunks[] = [
                        'type' => 'TEXT_MESSAGE_START',
                        'messageId' => $this->messageId,
                        'model' => $this->getAttr($event, 'model', $this->model),
                        'timestamp' => $this->timestamp,
                        'role' => 'assistant',
                    ];
                }

                $this->accumulatedContent .= $content;
                $chunks[] = [
                    'type' => 'TEXT_MESSAGE_CONTENT',
                    'messageId' => $this->messageId,
                    'model' => $this->getAttr($event, 'model', $this->model),
                    'timestamp' => $this->timestamp,
                    'delta' => $content,
                    'content' => $this->accumulatedContent,
                ];
            }

            // Handle tool calls
            $toolCalls = $this->getAttr($delta, 'tool_calls');
            if ($toolCalls) {
                foreach ($toolCalls as $index => $toolCall) {
                    $function = $this->getAttr($toolCall, 'function', []);
                    $toolCallId = $this->getAttr($toolCall, 'id', 'call_' . $this->timestamp);
                    $toolName = $this->getAttr($function, 'name', '');
                    $args = $this->getAttr($function, 'arguments', '');
                    $toolIndex = $this->getAttr($toolCall, 'index', $index);
                    
                    // Emit TOOL_CALL_START
                    $chunks[] = [
                        'type' => 'TOOL_CALL_START',
                        'toolCallId' => $toolCallId,
                        'toolName' => $toolName,
                        'model' => $this->getAttr($event, 'model', $this->model),
                        'timestamp' => $this->timestamp,
                        'index' => $toolIndex,
                    ];
                    
                    // Emit TOOL_CALL_ARGS if there are arguments
                    if ($args) {
                        $chunks[] = [
                            'type' => 'TOOL_CALL_ARGS',
                            'toolCallId' => $toolCallId,
                            'model' => $this->getAttr($event, 'model', $this->model),
                            'timestamp' => $this->timestamp,
                            'delta' => $args,
                            'args' => $args,
                        ];
                    }
                }
            }
        }

        // Handle completion
        $finishReason = $this->getAttr($choice, 'finish_reason');
        if ($finishReason) {
            // Emit TEXT_MESSAGE_END if we had text
            if ($this->textMessageStarted) {
                $chunks[] = [
                    'type' => 'TEXT_MESSAGE_END',
                    'messageId' => $this->messageId,
                    'model' => $this->getAttr($event, 'model', $this->model),
                    'timestamp' => $this->timestamp,
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

            $this->doneEmitted = true;
            $chunks[] = [
                'type' => 'RUN_FINISHED',
                'runId' => $this->runId,
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
     * Convert an error to RUN_ERROR event format
     */
    public function convertError(\Throwable $error): array
    {
        return [
            'type' => 'RUN_ERROR',
            'runId' => $this->runId,
            'model' => $this->model,
            'timestamp' => $this->timestamp,
            'error' => [
                'message' => $error->getMessage(),
                'code' => $error->getCode() ?: null
            ]
        ];
    }
}

