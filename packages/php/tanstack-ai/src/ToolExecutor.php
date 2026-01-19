<?php

namespace TanStack\AI;

/**
 * Tool execution logic for handling tool calls.
 * 
 * Handles three cases:
 * 1. Client tools (no execute) - request client execution
 * 2. Server tools with approval - check approval before executing
 * 3. Normal server tools - execute immediately
 */
class ToolExecutor
{
    /**
     * Execute tool calls based on their configuration.
     * 
     * @param array<array> $toolCalls Tool calls from the LLM
     * @param array<Tool> $tools Available tools with their configurations
     * @param array<string, bool> $approvals Map of approval decisions (approval.id -> approved boolean)
     * @param array<string, mixed> $clientResults Map of client-side execution results (toolCallId -> result)
     * @return array{results: array, needsApproval: array, needsClientExecution: array}
     */
    public static function executeToolCalls(
        array $toolCalls,
        array $tools,
        array $approvals = [],
        array $clientResults = []
    ): array {
        $results = [];
        $needsApproval = [];
        $needsClientExecution = [];

        // Create tool lookup map
        $toolMap = [];
        foreach ($tools as $tool) {
            $toolMap[$tool->name] = $tool;
        }

        error_log('[ToolExecutor] executeToolCalls: processing ' . count($toolCalls) . ' tool calls');
        error_log('[ToolExecutor] executeToolCalls: available tools: ' . implode(', ', array_keys($toolMap)));
        
        foreach ($toolCalls as $toolCall) {
            $toolName = $toolCall['function']['name'] ?? '';
            $toolCallId = $toolCall['id'] ?? '';
            error_log("[ToolExecutor] executeToolCalls: processing tool call id={$toolCallId}, name={$toolName}");
            error_log("[ToolExecutor] executeToolCalls: tool call data: " . json_encode($toolCall));
            
            $tool = $toolMap[$toolName] ?? null;

            if (!$tool) {
                error_log("[ToolExecutor] executeToolCalls: ERROR - Unknown tool: {$toolName}");
                // Unknown tool - return error
                $results[] = [
                    'toolCallId' => $toolCallId,
                    'toolName' => $toolName,
                    'result' => ['error' => "Unknown tool: {$toolName}"],
                    'state' => 'output-error',
                ];
                continue;
            }
            
            error_log("[ToolExecutor] executeToolCalls: found tool '{$toolName}', has execute=" . ($tool->execute ? 'yes' : 'no') . ", needsApproval=" . ($tool->needsApproval ? 'yes' : 'no'));

            // Parse arguments
            $argsStr = trim($toolCall['function']['arguments'] ?? '{}');
            if (empty($argsStr)) {
                $argsStr = '{}';
            }

            try {
                $input = json_decode($argsStr, true);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    throw new \InvalidArgumentException("Failed to parse tool arguments as JSON: {$argsStr}");
                }
            } catch (\Exception $e) {
                $results[] = [
                    'toolCallId' => $toolCall['id'] ?? '',
                    'toolName' => $toolName,
                    'result' => ['error' => $e->getMessage()],
                    'state' => 'output-error',
                ];
                continue;
            }

            // CASE 1: Client-side tool (no execute function)
            if (!$tool->execute) {
                if ($tool->needsApproval) {
                    $approvalId = "approval_{$toolCall['id']}";

                    // Check if approval decision exists
                    if (isset($approvals[$approvalId])) {
                        $approved = $approvals[$approvalId];

                        if ($approved) {
                            // Approved - check if client has executed
                            if (isset($clientResults[$toolCall['id']])) {
                                $results[] = [
                                    'toolCallId' => $toolCall['id'],
                                    'toolName' => $toolName,
                                    'result' => $clientResults[$toolCall['id']],
                                ];
                            } else {
                                // Approved but not executed yet - request client execution
                                $needsClientExecution[] = [
                                    'toolCallId' => $toolCall['id'],
                                    'toolName' => $toolName,
                                    'input' => $input,
                                ];
                            }
                        } else {
                            // User declined
                            $results[] = [
                                'toolCallId' => $toolCall['id'],
                                'toolName' => $toolName,
                                'result' => ['error' => 'User declined tool execution'],
                                'state' => 'output-error',
                            ];
                        }
                    } else {
                        // Need approval first
                        $needsApproval[] = [
                            'toolCallId' => $toolCall['id'],
                            'toolName' => $toolName,
                            'input' => $input,
                            'approvalId' => $approvalId,
                        ];
                    }
                } else {
                    // No approval needed - check if client has executed
                    if (isset($clientResults[$toolCall['id']])) {
                        $results[] = [
                            'toolCallId' => $toolCall['id'],
                            'toolName' => $toolName,
                            'result' => $clientResults[$toolCall['id']],
                        ];
                    } else {
                        // Request client execution
                        $needsClientExecution[] = [
                            'toolCallId' => $toolCall['id'],
                            'toolName' => $toolName,
                            'input' => $input,
                        ];
                    }
                }
                continue;
            }

            // CASE 2: Server tool with approval required
            if ($tool->needsApproval) {
                $approvalId = "approval_{$toolCall['id']}";

                // Check if approval decision exists
                if (isset($approvals[$approvalId])) {
                    $approved = $approvals[$approvalId];

                    if ($approved) {
                        // Execute after approval
                        $startTime = microtime(true);
                        try {
                            error_log("[ToolExecutor] Executing approved tool: {$toolName} with input: " . json_encode($input));
                            $result = call_user_func($tool->execute, $input);
                            $duration = (int)((microtime(true) - $startTime) * 1000);

                            // Handle async results (if using ReactPHP/Swoole)
                            if ($result instanceof \Generator) {
                                // For generators, we'd need to handle async execution
                                // For now, treat as synchronous
                                $result = iterator_to_array($result);
                            }

                            error_log("[ToolExecutor] Approved tool {$toolName} completed successfully");
                            $results[] = [
                                'toolCallId' => $toolCall['id'],
                                'toolName' => $toolName,
                                'result' => is_string($result) ? json_decode($result, true) : ($result ?? null),
                                'duration' => $duration,
                            ];
                        } catch (\Exception $e) {
                            $duration = (int)((microtime(true) - $startTime) * 1000);
                            error_log("[ToolExecutor] Approved tool {$toolName} ERROR: " . $e->getMessage());
                            error_log("[ToolExecutor] Approved tool {$toolName} ERROR File: " . $e->getFile() . ':' . $e->getLine());
                            error_log("[ToolExecutor] Approved tool {$toolName} ERROR Trace: " . $e->getTraceAsString());
                            $results[] = [
                                'toolCallId' => $toolCall['id'],
                                'toolName' => $toolName,
                                'result' => ['error' => $e->getMessage()],
                                'state' => 'output-error',
                                'duration' => $duration,
                            ];
                        }
                    } else {
                        // User declined
                        $results[] = [
                            'toolCallId' => $toolCall['id'],
                            'toolName' => $toolName,
                            'result' => ['error' => 'User declined tool execution'],
                            'state' => 'output-error',
                        ];
                    }
                } else {
                    // Need approval
                    $needsApproval[] = [
                        'toolCallId' => $toolCall['id'],
                        'toolName' => $toolName,
                        'input' => $input,
                        'approvalId' => $approvalId,
                    ];
                }
                continue;
            }

            // CASE 3: Normal server tool - execute immediately
            error_log("[ToolExecutor] executeToolCalls: executing server tool '{$toolName}' immediately");
            error_log("[ToolExecutor] executeToolCalls: tool input: " . json_encode($input));
            $startTime = microtime(true);
            try {
                $result = call_user_func($tool->execute, $input);
                $duration = (int)((microtime(true) - $startTime) * 1000);
                error_log("[ToolExecutor] executeToolCalls: tool '{$toolName}' completed in {$duration}ms");
                error_log("[ToolExecutor] executeToolCalls: tool '{$toolName}' result type: " . gettype($result));
                if (is_string($result)) {
                    error_log("[ToolExecutor] executeToolCalls: tool '{$toolName}' result (first 500 chars): " . substr($result, 0, 500));
                } else {
                    error_log("[ToolExecutor] executeToolCalls: tool '{$toolName}' result: " . json_encode($result));
                }

                // Handle async results
                if ($result instanceof \Generator) {
                    $result = iterator_to_array($result);
                }

                $results[] = [
                    'toolCallId' => $toolCall['id'],
                    'toolName' => $toolName,
                    'result' => is_string($result) ? json_decode($result, true) : ($result ?? null),
                    'duration' => $duration,
                ];
            } catch (\Exception $e) {
                $duration = (int)((microtime(true) - $startTime) * 1000);
                error_log("[ToolExecutor] executeToolCalls: tool '{$toolName}' ERROR: " . $e->getMessage());
                error_log("[ToolExecutor] executeToolCalls: tool '{$toolName}' ERROR File: " . $e->getFile() . ':' . $e->getLine());
                error_log("[ToolExecutor] executeToolCalls: tool '{$toolName}' ERROR Trace: " . $e->getTraceAsString());
                $results[] = [
                    'toolCallId' => $toolCall['id'],
                    'toolName' => $toolName,
                    'result' => ['error' => $e->getMessage()],
                    'state' => 'output-error',
                    'duration' => $duration,
                ];
            }
        }

        error_log('[ToolExecutor] executeToolCalls: completed - results=' . count($results) . ', needsApproval=' . count($needsApproval) . ', needsClientExecution=' . count($needsClientExecution));
        
        return [
            'results' => $results,
            'needsApproval' => $needsApproval,
            'needsClientExecution' => $needsClientExecution,
        ];
    }
}
