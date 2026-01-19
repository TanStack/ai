<?php

namespace TanStack\AI;

use Anthropic\Client as AnthropicClient;
use OpenAI\Factory;

/**
 * Orchestrates the chat loop with automatic tool execution.
 * 
 * This class manages the conversation state, handles the agentic loop,
 * executes tool calls, and emits appropriate stream chunks.
 */
class ChatEngine
{
    private const CYCLE_PHASE_PROCESS_CHAT = 'processChat';
    private const CYCLE_PHASE_EXECUTE_TOOL_CALLS = 'executeToolCalls';
    
    private const TOOL_PHASE_CONTINUE = 'continue';
    private const TOOL_PHASE_STOP = 'stop';
    private const TOOL_PHASE_WAIT = 'wait';

    private string $provider;
    private string $model;
    private array $messages;
    private array $tools;
    /** @var callable */
    private $loopStrategy;
    private ToolCallManager $toolCallManager;
    private int $initialMessageCount;
    
    // State
    private int $iterationCount = 0;
    private ?string $lastFinishReason = null;
    private ?string $currentMessageId = null;
    private string $accumulatedContent = '';
    private ?array $doneChunk = null;
    private bool $shouldEmitStreamEnd = true;
    private bool $earlyTermination = false;
    private string $toolPhase = self::TOOL_PHASE_CONTINUE;
    private string $cyclePhase = self::CYCLE_PHASE_PROCESS_CHAT;
    
    // IDs
    private string $requestId;
    private string $streamId;
    
    // Provider clients/API keys
    private ?AnthropicClient $anthropicClient = null;
    private $openaiClient = null;
    private ?string $anthropicApiKey = null;
    private ?string $openaiApiKey = null;

    /**
     * Create a new ChatEngine instance.
     * 
     * @param string $provider Provider name ('anthropic' or 'openai')
     * @param string $model Model name
     * @param array $messages Initial messages
     * @param array<Tool> $tools Available tools
     * @param callable|null $loopStrategy Agent loop strategy (defaults to maxIterations(5))
     * @param array $systemPrompts System prompts to prepend
     * @param string|null $anthropicApiKey Anthropic API key (optional, will try config if not provided)
     * @param string|null $openaiApiKey OpenAI API key (optional, will try config if not provided)
     */
    public function __construct(
        string $provider,
        string $model,
        array $messages,
        array $tools = [],
        ?callable $loopStrategy = null,
        array $systemPrompts = [],
        ?string $anthropicApiKey = null,
        ?string $openaiApiKey = null
    ) {
        $this->provider = strtolower($provider);
        $this->model = $model;
        $this->tools = $tools;
        $this->loopStrategy = $loopStrategy ?? AgentLoopStrategies::maxIterations(5);
        $this->toolCallManager = new ToolCallManager($tools);
        $this->initialMessageCount = count($messages);
        
        // Prepend system prompts
        $this->messages = $this->prependSystemPrompts($messages, $systemPrompts);
        
        // Generate IDs
        $this->requestId = $this->createId('chat');
        $this->streamId = $this->createId('stream');
        
        // Store API keys
        $this->anthropicApiKey = $anthropicApiKey;
        $this->openaiApiKey = $openaiApiKey;
    }

    /**
     * Main chat loop with automatic tool execution.
     * 
     * @return \Generator Yields StreamChunk arrays
     */
    public function chat(): \Generator
    {
        try {
            // Check for pending tool calls first
            foreach ($this->checkForPendingToolCalls() as $chunk) {
                yield $chunk;
            }

            if ($this->toolPhase === self::TOOL_PHASE_WAIT) {
                return;
            }

            // Main agentic loop
            while ($this->shouldContinue()) {
                if ($this->earlyTermination) {
                    error_log('[ChatEngine] chat: early termination detected, stopping');
                    return;
                }

                $this->beginCycle();
                error_log('[ChatEngine] chat: cycle phase=' . $this->cyclePhase . ', iteration=' . $this->iterationCount);

                if ($this->cyclePhase === self::CYCLE_PHASE_PROCESS_CHAT) {
                    foreach ($this->streamModelResponse() as $chunk) {
                        yield $chunk;
                    }
                } else {
                    foreach ($this->processToolCalls() as $chunk) {
                        yield $chunk;
                    }
                }

                $this->endCycle();
            }
            
            error_log('[ChatEngine] chat: loop ended, shouldContinue returned false');
        } finally {
            // Cleanup if needed
        }
    }

    /**
     * Prepend system prompts to messages.
     * 
     * @param array $messages Existing messages
     * @param array $systemPrompts System prompts to prepend
     * @return array Messages with system prompts prepended
     */
    private function prependSystemPrompts(array $messages, array $systemPrompts): array
    {
        if (empty($systemPrompts)) {
            return $messages;
        }

        $systemMessages = array_map(
            fn($content) => ['role' => 'system', 'content' => $content],
            $systemPrompts
        );

        return array_merge($systemMessages, $messages);
    }

    /**
     * Begin a cycle (either chat or tool execution).
     * 
     * @return void
     */
    private function beginCycle(): void
    {
        if ($this->cyclePhase === self::CYCLE_PHASE_PROCESS_CHAT) {
            $this->beginIteration();
        }
    }

    /**
     * End a cycle and switch phase.
     * 
     * @return void
     */
    private function endCycle(): void
    {
        if ($this->cyclePhase === self::CYCLE_PHASE_PROCESS_CHAT) {
            // Only switch to tool execution if we actually have tool calls
            if ($this->shouldExecuteToolPhase()) {
                error_log('[ChatEngine] endCycle: switching to tool execution phase');
                $this->cyclePhase = self::CYCLE_PHASE_EXECUTE_TOOL_CALLS;
            } else {
                error_log('[ChatEngine] endCycle: no tool calls, staying in chat phase');
                // No tool calls, increment iteration and stay in chat phase
                $this->iterationCount++;
            }
            return;
        }

        // Coming from tool execution phase, switch back to chat
        error_log('[ChatEngine] endCycle: switching back to chat phase, iteration=' . ($this->iterationCount + 1));
        $this->cyclePhase = self::CYCLE_PHASE_PROCESS_CHAT;
        $this->iterationCount++;
    }

    /**
     * Begin a new iteration.
     * 
     * @return void
     */
    private function beginIteration(): void
    {
        $this->currentMessageId = $this->createId('msg');
        $this->accumulatedContent = '';
        $this->doneChunk = null;
    }

    /**
     * Stream response from the model.
     * 
     * @return \Generator Yields StreamChunk arrays
     */
    private function streamModelResponse(): \Generator
    {
        $converter = new StreamChunkConverter(model: $this->model, provider: $this->provider);

        try {
            if ($this->provider === 'anthropic') {
                foreach ($this->streamAnthropic($converter) as $chunk) {
                    yield $chunk;
                    $this->handleStreamChunk($chunk);
                    
                    if ($this->earlyTermination) {
                        break;
                    }
                }
            } else {
                foreach ($this->streamOpenAI($converter) as $chunk) {
                    yield $chunk;
                    $this->handleStreamChunk($chunk);
                    
                    if ($this->earlyTermination) {
                        break;
                    }
                }
            }
        } catch (\Throwable $e) {
            error_log('[ChatEngine] streamModelResponse ERROR: ' . $e->getMessage());
            error_log('[ChatEngine] streamModelResponse ERROR File: ' . $e->getFile() . ':' . $e->getLine());
            error_log('[ChatEngine] streamModelResponse ERROR Trace: ' . $e->getTraceAsString());
            $errorChunk = $converter->convertError($e);
            yield $errorChunk;
            $this->earlyTermination = true;
            $this->shouldEmitStreamEnd = false;
        }
    }

    /**
     * Stream from Anthropic API.
     * 
     * @param StreamChunkConverter $converter Chunk converter
     * @return \Generator Yields StreamChunk arrays
     */
    private function streamAnthropic(StreamChunkConverter $converter): \Generator
    {
        [$systemMessage, $anthropicMessages] = MessageFormatters::formatMessagesForAnthropic($this->messages);
        
        // Get API key
        $apiKey = $this->anthropicApiKey;
        if (!$apiKey && function_exists('config')) {
            $apiKey = config('services.anthropic.key');
        }
        
        if (!$apiKey) {
            throw new \RuntimeException('ANTHROPIC_API_KEY is not configured');
        }
        
        // Create client if needed
        if (!$this->anthropicClient) {
            $this->anthropicClient = new AnthropicClient(apiKey: $apiKey);
        }

        $streamParams = [
            'maxTokens' => 1024,
            'messages' => $anthropicMessages,
            'model' => $this->model,
            'temperature' => 0.7,
        ];

        if ($systemMessage) {
            $streamParams['system'] = $systemMessage;
        }

        // Add tools if available
        if (!empty($this->tools)) {
            $formattedTools = MessageFormatters::formatToolsForAnthropic($this->tools);
            error_log('[ChatEngine] streamAnthropic: adding ' . count($this->tools) . ' tools to request');
            error_log('[ChatEngine] streamAnthropic: formatted tools: ' . json_encode($formattedTools));
            $streamParams['tools'] = $formattedTools;
        } else {
            error_log('[ChatEngine] streamAnthropic: no tools available');
        }

        $stream = $this->anthropicClient->messages->createStream(...$streamParams);

        foreach ($stream as $event) {
            // Log raw event from Anthropic API
            $eventData = is_object($event) ? json_decode(json_encode($event), true) : $event;
            error_log('[ChatEngine] streamAnthropic: RAW EVENT from API: ' . json_encode($eventData));
            
            $chunks = $converter->convertEvent($event);
            
            // Log converted chunks
            error_log('[ChatEngine] streamAnthropic: converted to ' . count($chunks) . ' chunk(s)');
            foreach ($chunks as $idx => $chunk) {
                error_log('[ChatEngine] streamAnthropic: chunk[' . $idx . ']: ' . json_encode($chunk));
                yield $chunk;
            }
        }
    }

    /**
     * Stream from OpenAI API.
     * 
     * @param StreamChunkConverter $converter Chunk converter
     * @return \Generator Yields StreamChunk arrays
     */
    private function streamOpenAI(StreamChunkConverter $converter): \Generator
    {
        $openaiMessages = MessageFormatters::formatMessagesForOpenAI($this->messages);
        
        // Get API key
        $apiKey = $this->openaiApiKey;
        if (!$apiKey && function_exists('config')) {
            $apiKey = config('services.openai.api_key');
        }
        
        if (!$apiKey) {
            throw new \RuntimeException('OPENAI_API_KEY is not configured');
        }
        
        // Create client if needed
        if (!$this->openaiClient) {
            $this->openaiClient = (new Factory())->withApiKey($apiKey)->make();
        }

        $params = [
            'model' => $this->model,
            'messages' => $openaiMessages,
            'max_tokens' => 1024,
            'temperature' => 0.7,
        ];

        // Add tools if available
        if (!empty($this->tools)) {
            $params['tools'] = MessageFormatters::formatToolsForOpenAI($this->tools);
        }

        $stream = $this->openaiClient->chat()->createStreamed($params);

        foreach ($stream as $event) {
            $chunks = $converter->convertEvent($event);
            foreach ($chunks as $chunk) {
                yield $chunk;
            }
        }
    }

    /**
     * Handle a stream chunk and update state.
     * 
     * @param array $chunk Stream chunk to handle
     * @return void
     */
    private function handleStreamChunk(array $chunk): void
    {
        try {
            $chunkType = $chunk['type'] ?? '';
            error_log("[ChatEngine] handleStreamChunk: type={$chunkType}");

            switch ($chunkType) {
                case 'content':
                    $this->accumulatedContent = $chunk['content'] ?? '';
                    break;
                case 'tool_call':
                    error_log("[ChatEngine] handleStreamChunk: tool_call chunk received!");
                    error_log("[ChatEngine] handleStreamChunk: tool_call chunk details: " . json_encode($chunk));
                    $this->toolCallManager->addToolCallChunk($chunk);
                    // Log state after adding
                    $currentToolCalls = $this->toolCallManager->getToolCalls();
                    error_log("[ChatEngine] handleStreamChunk: toolCallManager now has " . count($currentToolCalls) . " tool calls");
                    break;
                case 'done':
                    error_log("[ChatEngine] handleStreamChunk: done chunk received");
                    error_log("[ChatEngine] handleStreamChunk: done chunk details: " . json_encode($chunk));
                    error_log("[ChatEngine] handleStreamChunk: finishReason=" . ($chunk['finishReason'] ?? 'null'));
                    // Log tool call state when done chunk arrives
                    $finalToolCalls = $this->toolCallManager->getToolCalls();
                    error_log("[ChatEngine] handleStreamChunk: at done chunk, toolCallManager has " . count($finalToolCalls) . " tool calls");
                    if (!empty($finalToolCalls)) {
                        error_log("[ChatEngine] handleStreamChunk: tool calls at done: " . json_encode($finalToolCalls));
                    }
                    $this->handleDoneChunk($chunk);
                    break;
                case 'error':
                    error_log("[ChatEngine] handleStreamChunk: error chunk: " . json_encode($chunk));
                    $this->earlyTermination = true;
                    $this->shouldEmitStreamEnd = false;
                    break;
            }
        } catch (\Throwable $e) {
            error_log('[ChatEngine] handleStreamChunk ERROR: ' . $e->getMessage());
            error_log('[ChatEngine] handleStreamChunk ERROR File: ' . $e->getFile() . ':' . $e->getLine());
            error_log('[ChatEngine] handleStreamChunk ERROR Trace: ' . $e->getTraceAsString());
            throw $e;
        }
    }

    /**
     * Handle a done chunk.
     * 
     * @param array $chunk Done chunk
     * @return void
     */
    private function handleDoneChunk(array $chunk): void
    {
        // Don't overwrite a tool_calls finishReason with a stop finishReason
        if (
            $this->doneChunk &&
            ($this->doneChunk['finishReason'] ?? null) === 'tool_calls' &&
            ($chunk['finishReason'] ?? null) === 'stop'
        ) {
            $this->lastFinishReason = $chunk['finishReason'] ?? null;
            return;
        }

        $this->doneChunk = $chunk;
        $this->lastFinishReason = $chunk['finishReason'] ?? null;
    }

    /**
     * Check for pending tool calls in messages and execute them.
     * 
     * @return \Generator Yields StreamChunk arrays
     */
    private function checkForPendingToolCalls(): \Generator
    {
        $pendingToolCalls = $this->getPendingToolCallsFromMessages();
        if (empty($pendingToolCalls)) {
            return;
        }

        $doneChunk = $this->createSyntheticDoneChunk();

        // Collect client state (approvals and client tool results)
        $approvals = [];
        $clientToolResults = [];

        // Execute tool calls
        $executionResult = ToolExecutor::executeToolCalls(
            $pendingToolCalls,
            $this->tools,
            $approvals,
            $clientToolResults
        );

        // Handle approval requests
        if (!empty($executionResult['needsApproval']) || !empty($executionResult['needsClientExecution'])) {
            foreach ($this->emitApprovalRequests($executionResult['needsApproval'], $doneChunk) as $chunk) {
                yield $chunk;
            }

            foreach ($this->emitClientToolInputs($executionResult['needsClientExecution'], $doneChunk) as $chunk) {
                yield $chunk;
            }

            $this->shouldEmitStreamEnd = false;
            $this->toolPhase = self::TOOL_PHASE_WAIT;
            return;
        }

        // Emit tool results
        foreach ($this->emitToolResults($executionResult['results'], $doneChunk) as $chunk) {
            yield $chunk;
        }
    }

    /**
     * Process tool calls from the current iteration.
     * 
     * @return \Generator Yields StreamChunk arrays
     */
    private function processToolCalls(): \Generator
    {
        try {
            error_log('[ChatEngine] processToolCalls: starting');
            
            if (!$this->shouldExecuteToolPhase()) {
                error_log('[ChatEngine] processToolCalls: shouldExecuteToolPhase returned false');
                $this->setToolPhase(self::TOOL_PHASE_STOP);
                return;
            }

            $toolCalls = $this->toolCallManager->getToolCalls();
            $doneChunk = $this->doneChunk;

            error_log('[ChatEngine] processToolCalls: toolCalls count = ' . count($toolCalls));
            error_log('[ChatEngine] processToolCalls: doneChunk = ' . json_encode($doneChunk));

            if (!$doneChunk || empty($toolCalls)) {
                error_log('[ChatEngine] processToolCalls: no doneChunk or empty toolCalls');
                $this->setToolPhase(self::TOOL_PHASE_STOP);
                return;
            }

            // Add assistant message with tool calls
            $this->addAssistantToolCallMessage($toolCalls);

            // Collect client state
            $approvals = [];
            $clientToolResults = [];

            // Execute tool calls
            error_log('[ChatEngine] processToolCalls: executing ' . count($toolCalls) . ' tool calls');
            $executionResult = ToolExecutor::executeToolCalls(
                $toolCalls,
                $this->tools,
                $approvals,
                $clientToolResults
            );

            error_log('[ChatEngine] processToolCalls: executionResult = ' . json_encode([
                'results_count' => count($executionResult['results'] ?? []),
                'needsApproval_count' => count($executionResult['needsApproval'] ?? []),
                'needsClientExecution_count' => count($executionResult['needsClientExecution'] ?? []),
            ]));

            // Handle approval requests
            if (!empty($executionResult['needsApproval']) || !empty($executionResult['needsClientExecution'])) {
                error_log('[ChatEngine] processToolCalls: emitting approval/client requests');
                foreach ($this->emitApprovalRequests($executionResult['needsApproval'], $doneChunk) as $chunk) {
                    yield $chunk;
                }

                foreach ($this->emitClientToolInputs($executionResult['needsClientExecution'], $doneChunk) as $chunk) {
                    yield $chunk;
                }

                $this->setToolPhase(self::TOOL_PHASE_WAIT);
                return;
            }

            // Emit tool results
            error_log('[ChatEngine] processToolCalls: emitting ' . count($executionResult['results'] ?? []) . ' tool results');
            foreach ($this->emitToolResults($executionResult['results'], $doneChunk) as $chunk) {
                yield $chunk;
            }

            $this->toolCallManager->clear();
            $this->setToolPhase(self::TOOL_PHASE_CONTINUE);
            error_log('[ChatEngine] processToolCalls: completed successfully');
        } catch (\Throwable $e) {
            error_log('[ChatEngine] processToolCalls ERROR: ' . $e->getMessage());
            error_log('[ChatEngine] processToolCalls ERROR File: ' . $e->getFile() . ':' . $e->getLine());
            error_log('[ChatEngine] processToolCalls ERROR Trace: ' . $e->getTraceAsString());
            throw $e;
        }
    }

    /**
     * Check if we should execute the tool phase.
     * 
     * @return bool
     */
    private function shouldExecuteToolPhase(): bool
    {
        $hasDoneChunk = (bool)$this->doneChunk;
        $finishReason = $this->doneChunk['finishReason'] ?? null;
        $isToolCallsFinishReason = $finishReason === 'tool_calls';
        $hasTools = !empty($this->tools);
        $hasToolCalls = $this->toolCallManager->hasToolCalls();
        $toolCalls = $this->toolCallManager->getToolCalls();
        
        error_log('[ChatEngine] shouldExecuteToolPhase:');
        error_log('  - hasDoneChunk: ' . ($hasDoneChunk ? 'true' : 'false'));
        error_log('  - finishReason: ' . ($finishReason ?? 'null'));
        error_log('  - isToolCallsFinishReason: ' . ($isToolCallsFinishReason ? 'true' : 'false'));
        error_log('  - hasTools: ' . ($hasTools ? 'true' : 'false') . ' (count=' . count($this->tools) . ')');
        error_log('  - hasToolCalls: ' . ($hasToolCalls ? 'true' : 'false') . ' (count=' . count($toolCalls) . ')');
        if (!empty($toolCalls)) {
            error_log('  - toolCalls: ' . json_encode($toolCalls));
        }
        
        $result = (
            $hasDoneChunk &&
            $isToolCallsFinishReason &&
            $hasTools &&
            $hasToolCalls
        );
        
        error_log('  - result: ' . ($result ? 'true' : 'false'));
        
        return $result;
    }

    /**
     * Add an assistant message with tool calls to the conversation.
     * 
     * @param array $toolCalls Tool calls to add
     * @return void
     */
    private function addAssistantToolCallMessage(array $toolCalls): void
    {
        // For assistant messages with tool calls, content can be empty string if there's no text
        // The formatter will handle creating the proper content array with tool_use items
        $this->messages[] = [
            'role' => 'assistant',
            'content' => $this->accumulatedContent ?: '', // Use empty string instead of null
            'toolCalls' => $toolCalls,
        ];
        
        error_log('[ChatEngine] addAssistantToolCallMessage: added message with ' . count($toolCalls) . ' tool calls, content=' . ($this->accumulatedContent ?: '(empty string)'));
    }

    /**
     * Emit approval request chunks.
     * 
     * @param array $approvalRequests Approval requests
     * @param array $doneChunk Done chunk for metadata
     * @return \Generator Yields StreamChunk arrays
     */
    private function emitApprovalRequests(array $approvalRequests, array $doneChunk): \Generator
    {
        foreach ($approvalRequests as $approval) {
            yield [
                'type' => 'approval-requested',
                'id' => $doneChunk['id'] ?? $this->createId('pending'),
                'model' => $doneChunk['model'] ?? $this->model,
                'timestamp' => (int)(microtime(true) * 1000),
                'toolCallId' => $approval['toolCallId'] ?? '',
                'toolName' => $approval['toolName'] ?? '',
                'input' => $approval['input'] ?? [],
                'approval' => [
                    'id' => $approval['approvalId'] ?? '',
                    'needsApproval' => true,
                ],
            ];
        }
    }

    /**
     * Emit tool-input-available chunks for client execution.
     * 
     * @param array $clientRequests Client tool requests
     * @param array $doneChunk Done chunk for metadata
     * @return \Generator Yields StreamChunk arrays
     */
    private function emitClientToolInputs(array $clientRequests, array $doneChunk): \Generator
    {
        foreach ($clientRequests as $clientTool) {
            yield [
                'type' => 'tool-input-available',
                'id' => $doneChunk['id'] ?? $this->createId('pending'),
                'model' => $doneChunk['model'] ?? $this->model,
                'timestamp' => (int)(microtime(true) * 1000),
                'toolCallId' => $clientTool['toolCallId'] ?? '',
                'toolName' => $clientTool['toolName'] ?? '',
                'input' => $clientTool['input'] ?? [],
            ];
        }
    }

    /**
     * Emit tool result chunks and add to messages.
     * 
     * @param array $results Tool execution results
     * @param array $doneChunk Done chunk for metadata
     * @return \Generator Yields StreamChunk arrays
     */
    private function emitToolResults(array $results, array $doneChunk): \Generator
    {
        try {
            error_log('[ChatEngine] emitToolResults: emitting ' . count($results) . ' results');
            foreach ($results as $result) {
                $resultData = $result['result'] ?? [];
                error_log('[ChatEngine] emitToolResults: processing result for toolCallId=' . ($result['toolCallId'] ?? 'null'));
                error_log('[ChatEngine] emitToolResults: result data type=' . gettype($resultData));
                
                $content = json_encode($resultData);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    error_log('[ChatEngine] emitToolResults: JSON encode error: ' . json_last_error_msg());
                    $content = json_encode(['error' => 'Failed to encode tool result']);
                }

                $chunk = [
                    'type' => 'tool_result',
                    'id' => $doneChunk['id'] ?? $this->createId('pending'),
                    'model' => $doneChunk['model'] ?? $this->model,
                    'timestamp' => (int)(microtime(true) * 1000),
                    'toolCallId' => $result['toolCallId'] ?? '',
                    'content' => $content,
                ];
                
                error_log('[ChatEngine] emitToolResults: yielding chunk: ' . json_encode($chunk));
                yield $chunk;

                // Add tool result message
                $this->messages[] = [
                    'role' => 'tool',
                    'content' => $content,
                    'toolCallId' => $result['toolCallId'] ?? '',
                ];
            }
        } catch (\Throwable $e) {
            error_log('[ChatEngine] emitToolResults ERROR: ' . $e->getMessage());
            error_log('[ChatEngine] emitToolResults ERROR File: ' . $e->getFile() . ':' . $e->getLine());
            error_log('[ChatEngine] emitToolResults ERROR Trace: ' . $e->getTraceAsString());
            throw $e;
        }
    }

    /**
     * Get tool calls that don't have results yet.
     * 
     * @return array Pending tool calls
     */
    private function getPendingToolCallsFromMessages(): array
    {
        $completedToolIds = [];
        foreach ($this->messages as $msg) {
            if (($msg['role'] ?? '') === 'tool' && isset($msg['toolCallId'])) {
                $completedToolIds[] = $msg['toolCallId'];
            }
        }
        $completedToolIds = array_flip($completedToolIds);

        $pending = [];
        foreach ($this->messages as $msg) {
            if (($msg['role'] ?? '') === 'assistant' && isset($msg['toolCalls'])) {
                foreach ($msg['toolCalls'] as $toolCall) {
                    $toolCallId = $toolCall['id'] ?? null;
                    if ($toolCallId && !isset($completedToolIds[$toolCallId])) {
                        $pending[] = $toolCall;
                    }
                }
            }
        }

        return $pending;
    }

    /**
     * Create a synthetic done chunk for pending tool calls.
     * 
     * @return array Done chunk
     */
    private function createSyntheticDoneChunk(): array
    {
        return [
            'type' => 'done',
            'id' => $this->createId('pending'),
            'model' => $this->model,
            'timestamp' => (int)(microtime(true) * 1000),
            'finishReason' => 'tool_calls',
        ];
    }

    /**
     * Check if the loop should continue.
     * 
     * @return bool
     */
    private function shouldContinue(): bool
    {
        // If we're in tool execution phase, check if we should actually execute tools
        if ($this->cyclePhase === self::CYCLE_PHASE_EXECUTE_TOOL_CALLS) {
            // Only continue if we actually have tool calls to process
            if ($this->shouldExecuteToolPhase()) {
                return true;
            }
            // No tool calls to process, stop the loop
            error_log('[ChatEngine] shouldContinue: no tool calls to process, stopping loop');
            return false;
        }

        // If finishReason is 'stop' (not 'tool_calls'), stop immediately
        if ($this->lastFinishReason === 'stop') {
            error_log('[ChatEngine] shouldContinue: finishReason=stop, stopping loop');
            return false;
        }

        $state = [
            'iterationCount' => $this->iterationCount,
            'messages' => $this->messages,
            'finishReason' => $this->lastFinishReason,
        ];

        $strategyResult = call_user_func($this->loopStrategy, $state);
        $toolPhaseOk = $this->toolPhase === self::TOOL_PHASE_CONTINUE;
        
        error_log('[ChatEngine] shouldContinue: iteration=' . $this->iterationCount . ', finishReason=' . ($this->lastFinishReason ?? 'null') . ', strategy=' . ($strategyResult ? 'true' : 'false') . ', toolPhase=' . $this->toolPhase);
        
        return $strategyResult && $toolPhaseOk;
    }

    /**
     * Set the tool phase.
     * 
     * @param string $phase Tool phase
     * @return void
     */
    private function setToolPhase(string $phase): void
    {
        $this->toolPhase = $phase;
        if ($phase === self::TOOL_PHASE_WAIT) {
            $this->shouldEmitStreamEnd = false;
        }
    }

    /**
     * Create a unique ID with a prefix.
     * 
     * @param string $prefix ID prefix
     * @return string Unique ID
     */
    private function createId(string $prefix): string
    {
        $timestamp = (int)(microtime(true) * 1000);
        $randomSuffix = bin2hex(random_bytes(4));
        return "{$prefix}-{$timestamp}-{$randomSuffix}";
    }
}
