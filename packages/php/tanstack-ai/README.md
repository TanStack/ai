# TanStack AI PHP

PHP utilities for converting AI provider events to TanStack AI StreamChunk format and formatting messages between TanStack AI and provider formats.

## Installation

```bash
composer require tanstack/ai
```

Or install from source:

```bash
cd packages/php/tanstack-ai
composer install
```

## Usage

### StreamChunkConverter

Convert provider streaming events to TanStack AI StreamChunk format:

```php
use TanStack\AI\StreamChunkConverter;

$converter = new StreamChunkConverter(
    model: "claude-3-haiku-20240307",
    provider: "anthropic"
);

foreach ($anthropicStream as $event) {
    $chunks = $converter->convertEvent($event);
    foreach ($chunks as $chunk) {
        // Process StreamChunk
    }
}
```

### Message Formatters

Convert TanStack AI messages to provider formats:

```php
use TanStack\AI\MessageFormatters;

// Convert to Anthropic format
[$systemMessage, $anthropicMessages] = MessageFormatters::formatMessagesForAnthropic($messages);

// Convert to OpenAI format
$openaiMessages = MessageFormatters::formatMessagesForOpenAI($messages);
```

### SSE Formatting Utilities

Format StreamChunk arrays as Server-Sent Events (SSE) for HTTP responses:

```php
use TanStack\AI\SSEFormatter;

// Format a chunk
$sseData = SSEFormatter::formatChunk($chunk); // Returns "data: {...}\n\n"

// Format completion marker
$sseDone = SSEFormatter::formatDone(); // Returns "data: [DONE]\n\n"

// Format an error
$sseError = SSEFormatter::formatError($exception); // Returns formatted error chunk
```

Example usage in Slim Framework:

```php
use TanStack\AI\StreamChunkConverter;
use TanStack\AI\SSEFormatter;

function generateStream($stream, $converter) {
    foreach ($stream as $event) {
        $chunks = $converter->convertEvent($event);
        foreach ($chunks as $chunk) {
            yield SSEFormatter::formatChunk($chunk);
        }
    }
    yield SSEFormatter::formatDone();
}
```

## Supported Providers

- Anthropic (Claude models)
- OpenAI (GPT models)

## License

MIT

