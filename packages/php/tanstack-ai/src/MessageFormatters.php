<?php

namespace TanStack\AI;

/**
 * Message formatting utilities for converting between TanStack AI and provider formats.
 */
class MessageFormatters
{
    /**
     * Convert TanStack AI message format to Anthropic format.
     * Separates system messages and formats tool messages.
     * 
     * @param array $messages List of TanStack AI messages
     * @return array Tuple of [system_message, formatted_messages]
     */
    public static function formatMessagesForAnthropic(array $messages): array
    {
        // Separate system messages
        $systemMessages = array_filter($messages, fn($m) => ($m['role'] ?? 'user') === 'system');
        $nonSystemMessages = array_filter($messages, fn($m) => ($m['role'] ?? 'user') !== 'system');

        // Anthropic API expects system to be a string (not a list)
        // Multiple system messages are joined with newlines
        $systemMessage = null;
        if (!empty($systemMessages)) {
            $systemContent = implode("\n", array_map(
                fn($m) => $m['content'] ?? '',
                array_filter($systemMessages, fn($m) => !empty($m['content'] ?? ''))
            ));
            if (trim($systemContent) !== '') {
                $systemMessage = $systemContent;
            }
        }

        $formattedMessages = [];
        foreach ($nonSystemMessages as $msg) {
            $role = $msg['role'] ?? 'user';
            // Handle content - it might be null, empty string, or not set at all
            $content = null;
            if (isset($msg['content'])) {
                $content = $msg['content'];
            }
            $toolCalls = $msg['toolCalls'] ?? null;
            $toolCallId = $msg['toolCallId'] ?? null;

            if ($role === 'tool' && $toolCallId) {
                // Tool result message
                $formattedMessages[] = [
                    'role' => 'user',
                    'content' => [[
                        'type' => 'tool_result',
                        'tool_use_id' => $toolCallId,
                        'content' => $content ?? ''
                    ]]
                ];
            } elseif ($role === 'assistant' && $toolCalls) {
                // Assistant message with tool calls
                $contentList = [];
                
                // Add text content if present (non-empty string)
                if (!empty($content) && is_string($content) && trim($content) !== '') {
                    $contentList[] = ['type' => 'text', 'text' => $content];
                }

                // Add tool use items
                foreach ($toolCalls as $toolCall) {
                    $contentList[] = [
                        'type' => 'tool_use',
                        'id' => $toolCall['id'],
                        'name' => $toolCall['function']['name'],
                        'input' => json_decode($toolCall['function']['arguments'], true)
                    ];
                }

                // Anthropic requires at least one content item, so if we only have tool calls, that's fine
                // But we must ensure contentList is not empty (it shouldn't be if we have tool calls)
                if (!empty($contentList)) {
                    error_log('[MessageFormatters] Formatting assistant message with ' . count($toolCalls) . ' tool calls, content items=' . count($contentList) . ', hasText=' . (!empty($content) ? 'yes' : 'no'));
                    $formattedMessages[] = [
                        'role' => 'assistant',
                        'content' => $contentList
                    ];
                } else {
                    error_log('[MessageFormatters] WARNING: Assistant message with tool calls but empty contentList!');
                }
            } else {
                // Regular message
                $formattedMessages[] = [
                    'role' => in_array($role, ['assistant', 'user']) ? $role : 'user',
                    'content' => $content ?? ''
                ];
            }
        }

        return [$systemMessage, array_values($formattedMessages)];
    }

    /**
     * Convert TanStack AI message format to OpenAI format.
     * 
     * @param array $messages List of TanStack AI messages
     * @return array List of OpenAI-formatted messages
     */
    public static function formatMessagesForOpenAI(array $messages): array
    {
        $formattedMessages = [];

        foreach ($messages as $msg) {
            $role = $msg['role'] ?? 'user';
            $content = $msg['content'] ?? null;
            $toolCalls = $msg['toolCalls'] ?? null;
            $toolCallId = $msg['toolCallId'] ?? null;
            $name = $msg['name'] ?? null;

            if ($role === 'tool' && $toolCallId) {
                $formattedMessages[] = [
                    'role' => 'tool',
                    'content' => $content ?? '',
                    'tool_call_id' => $toolCallId
                ];
            } elseif ($role === 'assistant' && $toolCalls) {
                $formattedMessages[] = [
                    'role' => 'assistant',
                    'content' => $content,
                    'tool_calls' => array_map(
                        fn($tc) => [
                            'id' => $tc['id'],
                            'type' => $tc['type'],
                            'function' => $tc['function']
                        ],
                        $toolCalls
                    )
                ];
            } else {
                $formattedMsg = [
                    'role' => in_array($role, ['system', 'user', 'assistant']) ? $role : 'user',
                    'content' => $content ?? ''
                ];
                if ($name) {
                    $formattedMsg['name'] = $name;
                }
                $formattedMessages[] = $formattedMsg;
            }
        }

        return $formattedMessages;
    }

    /**
     * Convert Tool objects to Anthropic format.
     * 
     * @param array<Tool> $tools List of Tool objects
     * @return array List of Anthropic-formatted tools
     */
    public static function formatToolsForAnthropic(array $tools): array
    {
        $formattedTools = [];
        
        foreach ($tools as $tool) {
            $toolDef = [
                'name' => $tool->name,
                'description' => $tool->description,
            ];
            
            // Convert inputSchema to Anthropic format
            if ($tool->inputSchema) {
                $toolDef['input_schema'] = $tool->inputSchema;
            }
            
            $formattedTools[] = $toolDef;
        }
        
        return $formattedTools;
    }

    /**
     * Convert Tool objects to OpenAI format.
     * 
     * @param array<Tool> $tools List of Tool objects
     * @return array List of OpenAI-formatted tools
     */
    public static function formatToolsForOpenAI(array $tools): array
    {
        $formattedTools = [];
        
        foreach ($tools as $tool) {
            $toolDef = [
                'type' => 'function',
                'function' => [
                    'name' => $tool->name,
                    'description' => $tool->description,
                ],
            ];
            
            // Convert inputSchema to OpenAI format (parameters)
            if ($tool->inputSchema) {
                $toolDef['function']['parameters'] = $tool->inputSchema;
            }
            
            $formattedTools[] = $toolDef;
        }
        
        return $formattedTools;
    }
}

