<?php

namespace TanStack\AI;

/**
 * Manages tool call accumulation and execution for the chat() method's automatic tool execution loop.
 * 
 * Responsibilities:
 * - Accumulates streaming tool call chunks (ID, name, arguments)
 * - Validates tool calls (filters out incomplete ones)
 * - Returns complete tool calls for execution
 */
class ToolCallManager
{
    /**
     * Map of tool calls by index (for streaming accumulation).
     * 
     * @var array<int, array>
     */
    private array $toolCallsMap = [];

    /**
     * List of available tools.
     * 
     * @var array<Tool>
     */
    private array $tools;

    /**
     * Create a new ToolCallManager instance.
     * 
     * @param array<Tool> $tools List of available tools
     */
    public function __construct(array $tools)
    {
        $this->tools = $tools;
    }

    /**
     * Add a tool call chunk to the accumulator.
     * Handles streaming tool calls by accumulating arguments.
     * 
     * @param array $chunk Tool call chunk with toolCall and index
     * @return void
     */
    public function addToolCallChunk(array $chunk): void
    {
        try {
            $index = $chunk['index'] ?? -1;
            $toolCall = $chunk['toolCall'] ?? [];
            
            if ($index < 0 || empty($toolCall)) {
                error_log("[ToolCallManager] addToolCallChunk: invalid chunk (index={$index}, empty=" . (empty($toolCall) ? 'true' : 'false') . ")");
                return;
            }

            $existing = $this->toolCallsMap[$index] ?? null;

            if (!$existing) {
                // Only create entry if we have a tool call ID and name
                $toolCallId = $toolCall['id'] ?? null;
                $functionName = $toolCall['function']['name'] ?? null;
                
                if ($toolCallId && $functionName) {
                    error_log("[ToolCallManager] addToolCallChunk: creating new tool call [{$index}] id={$toolCallId}, name={$functionName}");
                    $this->toolCallsMap[$index] = [
                        'id' => $toolCallId,
                        'type' => 'function',
                        'function' => [
                            'name' => $functionName,
                            'arguments' => $toolCall['function']['arguments'] ?? '',
                        ],
                    ];
                } else {
                    error_log("[ToolCallManager] addToolCallChunk: missing id or name (id=" . ($toolCallId ?? 'null') . ", name=" . ($functionName ?? 'null') . ")");
                }
            } else {
                // Update name if it wasn't set before
                if (!empty($toolCall['function']['name']) && empty($existing['function']['name'])) {
                    $existing['function']['name'] = $toolCall['function']['name'];
                }
                
                // Replace arguments - StreamChunkConverter already accumulates, so we just take the latest
                if (isset($toolCall['function']['arguments'])) {
                    $existing['function']['arguments'] = $toolCall['function']['arguments'];
                }
                
                error_log("[ToolCallManager] addToolCallChunk: updating existing tool call [{$index}], args=" . substr($existing['function']['arguments'], 0, 50) . (strlen($existing['function']['arguments']) > 50 ? '...' : ''));
                $this->toolCallsMap[$index] = $existing;
            }
        } catch (\Throwable $e) {
            error_log("[ToolCallManager] addToolCallChunk ERROR: " . $e->getMessage());
            error_log("[ToolCallManager] addToolCallChunk ERROR File: " . $e->getFile() . ':' . $e->getLine());
            error_log("[ToolCallManager] addToolCallChunk ERROR Trace: " . $e->getTraceAsString());
            throw $e;
        }
    }

    /**
     * Check if there are any complete tool calls to execute.
     * 
     * @return bool
     */
    public function hasToolCalls(): bool
    {
        return count($this->getToolCalls()) > 0;
    }

    /**
     * Get all complete tool calls (filtered for valid ID and name).
     * 
     * @return array<array> Array of tool call arrays
     */
    public function getToolCalls(): array
    {
        $completeCalls = [];
        
        error_log('[ToolCallManager] getToolCalls: checking ' . count($this->toolCallsMap) . ' tool calls in map');
        
        foreach ($this->toolCallsMap as $index => $toolCall) {
            $id = $toolCall['id'] ?? null;
            $name = $toolCall['function']['name'] ?? null;
            
            error_log("[ToolCallManager] getToolCalls: checking call [{$index}] id=" . ($id ?? 'null') . ", name=" . ($name ?? 'null'));
            
            if ($id && $name && trim($name) !== '') {
                error_log("[ToolCallManager] getToolCalls: adding complete call [{$index}]");
                $completeCalls[] = $toolCall;
            } else {
                error_log("[ToolCallManager] getToolCalls: skipping incomplete call [{$index}]");
            }
        }
        
        error_log('[ToolCallManager] getToolCalls: returning ' . count($completeCalls) . ' complete calls');
        
        return $completeCalls;
    }

    /**
     * Clear the tool calls map for the next iteration.
     * 
     * @return void
     */
    public function clear(): void
    {
        $this->toolCallsMap = [];
    }
}
