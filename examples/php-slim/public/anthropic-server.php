<?php

declare(strict_types=1);

/**
 * PHP Slim Framework server example for TanStack AI
 * Streams Anthropic API events in SSE format compatible with TanStack AI client
 */

require __DIR__ . '/../vendor/autoload.php';

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;
use Dotenv\Dotenv;
use TanStack\AI\StreamChunkConverter;
use TanStack\AI\MessageFormatters;
use TanStack\AI\SSEFormatter;
use Anthropic\Client;
use Monolog\Logger;
use Monolog\Handler\StreamHandler;
use Slim\Psr7\Response as SlimResponse;

// Load environment variables
$dotenv = Dotenv::createImmutable(__DIR__ . '/..');
$dotenv->load();

// Configure logging
$logger = new Logger('tanstack-ai');
$logger->pushHandler(new StreamHandler('php://stdout', Logger::INFO));

// Initialize Slim app
$app = AppFactory::create();

// CORS middleware - wide open for development
$app->add(function (Request $request, $handler) {
    // Handle preflight OPTIONS request
    if ($request->getMethod() === 'OPTIONS') {
        $response = new SlimResponse();
        return $response
            ->withHeader('Access-Control-Allow-Origin', '*')
            ->withHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
            ->withHeader('Access-Control-Max-Age', '86400')
            ->withStatus(204);
    }
    
    $response = $handler->handle($request);
    return $response
        ->withHeader('Access-Control-Allow-Origin', '*')
        ->withHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
});

// Initialize Anthropic client
$anthropicApiKey = $_ENV['ANTHROPIC_API_KEY'] ?? null;
if (!$anthropicApiKey) {
    throw new RuntimeException(
        "ANTHROPIC_API_KEY environment variable is required. " .
        "Please set it in your .env file or environment."
    );
}

// Validate API key format
if (str_starts_with($anthropicApiKey, 'op://')) {
    throw new RuntimeException(
        "⚠️  ERROR: API key appears to be a 1Password reference (op://...).\n" .
        "You need to use the actual API key value, not the 1Password reference.\n" .
        "Please copy the actual key from 1Password (starts with 'sk-ant-') and update your .env file."
    );
}

if (!str_starts_with($anthropicApiKey, 'sk-ant-')) {
    $logger->warning("API key doesn't start with 'sk-ant-'. This may not be a valid Anthropic API key.");
    $logger->warning("Key starts with: " . substr($anthropicApiKey, 0, 10) . "...");
}

if (strlen($anthropicApiKey) < 40) {
    $logger->warning("API key seems too short (" . strlen($anthropicApiKey) . " chars). Anthropic keys are typically 50+ characters.");
}

// Display API key info on startup (masked for security)
function maskApiKey(string $key): string
{
    if (strlen($key) <= 11) {
        return str_repeat('*', strlen($key));
    }
    return substr($key, 0, 7) . '...' . substr($key, -4);
}

echo "\n" . str_repeat('=', 60) . "\n";
echo "🚀 TanStack AI Slim Server Starting (Anthropic)...\n";
echo str_repeat('=', 60) . "\n";
echo "✅ ANTHROPIC_API_KEY loaded: " . maskApiKey($anthropicApiKey) . "\n";
echo "   Key length: " . strlen($anthropicApiKey) . " characters\n";
echo "🌐 Server will start on: http://0.0.0.0:8000\n";
echo "   (Note: Run with: php -S 0.0.0.0:8000 -t public public/anthropic-server.php)\n";
echo str_repeat('=', 60) . "\n\n";

$client = new Client(apiKey: $anthropicApiKey);

// Explicit OPTIONS route for CORS preflight
$app->options('/chat', function (Request $request, Response $response) {
    return $response
        ->withHeader('Access-Control-Allow-Origin', '*')
        ->withHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        ->withHeader('Access-Control-Max-Age', '86400')
        ->withStatus(204);
});

// Chat endpoint
$app->post('/chat', function (Request $request, Response $response) use ($client, $logger) {
    try {
        $body = json_decode($request->getBody()->getContents(), true);
        $messages = $body['messages'] ?? [];
        $data = $body['data'] ?? [];

        $logger->info("📥 POST /chat received - " . count($messages) . " messages");

        // Convert messages to Anthropic format
        [$systemMessage, $anthropicMessages] = MessageFormatters::formatMessagesForAnthropic($messages);
        $logger->info("✅ Converted " . count($anthropicMessages) . " messages to Anthropic format");
        if ($systemMessage) {
            $preview = strlen($systemMessage) > 50 ? substr($systemMessage, 0, 50) . "..." : $systemMessage;
            $logger->info("📝 System message: " . $preview);
        }

        // Default model
        $model = $data['model'] ?? 'claude-3-haiku-20240307';
        $logger->info("🤖 Using model: " . $model);

        // Initialize converter
        $converter = new StreamChunkConverter(model: $model, provider: 'anthropic');

        // Send headers immediately for streaming (must be before any output)
        // Disable output buffering and send headers
        if (ob_get_level() > 0) {
            ob_end_clean();
        }
        
        header('Content-Type: text/event-stream');
        header('Cache-Control: no-cache');
        header('Connection: keep-alive');
        header('X-Accel-Buffering: no');
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
        
        // Flush headers immediately
        flush();

        // Stream response with CORS headers (for Slim response object)
        $response = $response
            ->withHeader('Content-Type', 'text/event-stream')
            ->withHeader('Cache-Control', 'no-cache')
            ->withHeader('Connection', 'keep-alive')
            ->withHeader('X-Accel-Buffering', 'no')
            ->withHeader('Access-Control-Allow-Origin', '*')
            ->withHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            ->withHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

        // Note: We're using direct output (echo) for streaming, so we don't need the response body

        // Stream from Anthropic
        $logger->info("🚀 Starting Anthropic stream with params: model={$model}, messages=" . count($anthropicMessages) . ", system=" . ($systemMessage ? 'yes' : 'no'));

        $eventCount = 0;
        $chunkCount = 0;

        try {
            // Create stream - Anthropic PHP SDK uses createStream() method
            if ($systemMessage !== null && trim($systemMessage) !== '') {
                $stream = $client->messages->createStream(
                    maxTokens: 1024,
                    messages: $anthropicMessages,
                    model: $model,
                    temperature: 0.7,
                    system: $systemMessage
                );
            } else {
                $stream = $client->messages->createStream(
                    maxTokens: 1024,
                    messages: $anthropicMessages,
                    model: $model,
                    temperature: 0.7
                );
            }

            $logger->info("✅ Anthropic stream opened, starting to receive events...");

            foreach ($stream as $event) {
                $eventCount++;
                // Convert event to array if it's an object
                $eventData = is_array($event) ? $event : (array)$event;
                $eventType = $eventData['type'] ?? (property_exists($event, 'type') ? $event->type : 'unknown');
                $logger->debug("📨 Received Anthropic event #{$eventCount}: {$eventType}");

                // Convert Anthropic event to StreamChunk format
                $chunks = $converter->convertEvent($event);

                foreach ($chunks as $chunk) {
                    $chunkCount++;
                    $chunkType = $chunk['type'] ?? 'unknown';
                    $logger->debug("📤 Sending chunk #{$chunkCount} (type: {$chunkType})");
                    $chunkData = SSEFormatter::formatChunk($chunk);
                    // Output directly for streaming
                    echo $chunkData;
                    if (ob_get_level() > 0) {
                        ob_flush();
                    }
                    flush();
                }
            }

            $logger->info("✅ Stream complete - {$eventCount} events, {$chunkCount} chunks sent");

            // Send completion marker
            $logger->info("📤 Sending [DONE] marker");
            $doneMarker = SSEFormatter::formatDone();
            echo $doneMarker;
            flush();

        } catch (\Throwable $e) {
            $logger->error("❌ Error in stream: " . get_class($e) . ": " . $e->getMessage());
            // Send error chunk
            $errorChunk = $converter->convertError($e);
            $errorData = SSEFormatter::formatChunk($errorChunk);
            echo $errorData;
            flush();
            exit;
        }

        // Should not reach here, but just in case
        exit;

    } catch (\Throwable $e) {
        $logger->error("❌ Error in chat_endpoint: " . get_class($e) . ": " . $e->getMessage());
        $response->getBody()->write(json_encode(['error' => $e->getMessage()]));
        return $response->withStatus(500)->withHeader('Content-Type', 'application/json');
    }
});

// Health check endpoint
$app->get('/health', function (Request $request, Response $response) {
    $response->getBody()->write(json_encode([
        'status' => 'ok',
        'service' => 'tanstack-ai-slim-anthropic'
    ]));
    return $response->withHeader('Content-Type', 'application/json');
});

$app->run();

