<?php

/**
 * Example usage of TanStack AI PHP library
 */

require __DIR__ . '/../vendor/autoload.php';

use TanStack\AI\StreamChunkConverter;
use TanStack\AI\MessageFormatters;
use TanStack\AI\SSEFormatter;

// Example 1: Convert messages to Anthropic format
$messages = [
    [
        'role' => 'system',
        'content' => 'You are a helpful assistant.'
    ],
    [
        'role' => 'user',
        'content' => 'Hello!'
    ]
];

[$systemMessage, $anthropicMessages] = MessageFormatters::formatMessagesForAnthropic($messages);
echo "System message: " . ($systemMessage ?? 'none') . "\n";
echo "Anthropic messages: " . json_encode($anthropicMessages, JSON_PRETTY_PRINT) . "\n\n";

// Example 2: Convert messages to OpenAI format
$openaiMessages = MessageFormatters::formatMessagesForOpenAI($messages);
echo "OpenAI messages: " . json_encode($openaiMessages, JSON_PRETTY_PRINT) . "\n\n";

// Example 3: Initialize converter
$converter = new StreamChunkConverter(
    model: 'claude-3-haiku-20240307',
    provider: 'anthropic'
);

// Example 4: Convert an event (simulated)
$simulatedEvent = [
    'type' => 'content_block_delta',
    'delta' => [
        'type' => 'text_delta',
        'text' => 'Hello'
    ]
];

$chunks = $converter->convertEvent($simulatedEvent);
foreach ($chunks as $chunk) {
    echo "Chunk: " . SSEFormatter::formatChunk($chunk);
}

// Example 5: Format completion
echo SSEFormatter::formatDone();

// Example 6: Handle errors
try {
    throw new Exception('Something went wrong');
} catch (Exception $e) {
    $errorChunk = $converter->convertError($e);
    echo SSEFormatter::formatChunk($errorChunk);
}

