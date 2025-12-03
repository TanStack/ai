<?php

declare(strict_types=1);

/**
 * PHP Slim Framework server example for TanStack AI
 * Streams OpenAI API events in SSE format compatible with TanStack AI client
 */

require __DIR__ . '/../vendor/autoload.php';

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Factory\AppFactory;
use Dotenv\Dotenv;
use TanStack\AI\StreamChunkConverter;
use TanStack\AI\MessageFormatters;
use TanStack\AI\SSEFormatter;
use OpenAI\Client as OpenAIClient;
use OpenAI\Factory;
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

// Initialize OpenAI client
$openaiApiKey = $_ENV['OPENAI_API_KEY'] ?? null;
if (!$openaiApiKey) {
    throw new RuntimeException(
        "OPENAI_API_KEY environment variable is required. " .
        "Please set it in your .env file or environment."
    );
}

// Validate API key format
if (str_starts_with($openaiApiKey, 'op://')) {
    throw new RuntimeException(
        "⚠️  ERROR: API key appears to be a 1Password reference (op://...).\n" .
        "You need to use the actual API key value, not the 1Password reference.\n" .
        "Please copy the actual key from 1Password (starts with 'sk-') and update your .env file."
    );
}

if (!str_starts_with($openaiApiKey, 'sk-')) {
    $logger->warning("API key doesn't start with 'sk-'. This may not be a valid OpenAI API key.");
    $logger->warning("Key starts with: " . substr($openaiApiKey, 0, 10) . "...");
}

if (strlen($openaiApiKey) < 40) {
    $logger->warning("API key seems too short (" . strlen($openaiApiKey) . " chars). OpenAI keys are typically 50+ characters.");
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
echo "🚀 TanStack AI Slim Server Starting (OpenAI)...\n";
echo str_repeat('=', 60) . "\n";
echo "✅ OPENAI_API_KEY loaded: " . maskApiKey($openaiApiKey) . "\n";
echo "   Key length: " . strlen($openaiApiKey) . " characters\n";
echo "🌐 Server will start on: http://0.0.0.0:8001\n";
echo "   (Note: Run with: php -S 0.0.0.0:8001 -t public public/openai-server.php)\n";
echo str_repeat('=', 60) . "\n\n";

$client = (new Factory())->withApiKey($openaiApiKey)->make();

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

        // Convert messages to OpenAI format
        $openaiMessages = MessageFormatters::formatMessagesForOpenAI($messages);
        $logger->info("✅ Converted " . count($openaiMessages) . " messages to OpenAI format");

        // Default model
        $model = $data['model'] ?? 'gpt-4o';
        $logger->info("🤖 Using model: " . $model);

        // Initialize converter
        $converter = new StreamChunkConverter(model: $model, provider: 'openai');

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

        $logger->info("🚀 Starting OpenAI stream for model: {$model}");

        $eventCount = 0;
        $chunkCount = 0;

        try {
            // Stream from OpenAI
            $stream = $client->chat()->createStreamed([
                'model' => $model,
                'messages' => $openaiMessages,
                'max_tokens' => 1024,
                'temperature' => 0.7,
            ]);

            $logger->info("✅ OpenAI stream created, starting to receive events...");

            foreach ($stream as $event) {
                $eventCount++;
                // Convert event to array if it's an object
                $eventData = is_array($event) ? $event : (array)$event;
                $logger->debug("📨 Received OpenAI event #{$eventCount}: " . (is_array($event) ? 'array' : get_class($event)));

                // Convert OpenAI event to StreamChunk format
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
        'service' => 'tanstack-ai-slim-openai'
    ]));
    return $response->withHeader('Content-Type', 'application/json');
});

$app->run();

