<?php

declare(strict_types=1);

function stream_openai(
    string $model,
    string $system,
    array $messages,
    callable $emit
): void {
    $apiKey = getenv('OPENAI_API_KEY') ?: '';
    if ($apiKey === '') {
        throw new RuntimeException('OPENAI_API_KEY is not set');
    }

    $openaiMessages = [];
    if ($system !== '') {
        $openaiMessages[] = ['role' => 'system', 'content' => $system];
    }
    foreach ($messages as $message) {
        $openaiMessages[] = [
            'role' => $message['role'],
            'content' => $message['content'],
        ];
    }

    $payload = json_encode([
        'model' => $model,
        'messages' => $openaiMessages,
        'stream' => true,
    ], JSON_UNESCAPED_UNICODE);

    if ($payload === false) {
        throw new RuntimeException('failed to encode OpenAI request');
    }

    stream_provider_sse(
        'https://api.openai.com/v1/chat/completions',
        [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
        ],
        $payload,
        static function (array $parsed) use ($emit): void {
            $delta = $parsed['choices'][0]['delta']['content'] ?? null;
            if (is_string($delta) && $delta !== '') {
                $emit($delta);
            }
        }
    );
}

function stream_anthropic(
    string $model,
    string $system,
    array $messages,
    callable $emit
): void {
    $apiKey = getenv('ANTHROPIC_API_KEY') ?: '';
    if ($apiKey === '') {
        throw new RuntimeException('ANTHROPIC_API_KEY is not set');
    }

    $anthropicMessages = [];
    foreach ($messages as $message) {
        $anthropicMessages[] = [
            'role' => $message['role'],
            'content' => $message['content'],
        ];
    }

    $body = [
        'model' => $model,
        'max_tokens' => 4096,
        'messages' => $anthropicMessages,
        'stream' => true,
    ];
    if ($system !== '') {
        $body['system'] = $system;
    }

    $payload = json_encode($body, JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        throw new RuntimeException('failed to encode Anthropic request');
    }

    stream_provider_sse(
        'https://api.anthropic.com/v1/messages',
        [
            'x-api-key: ' . $apiKey,
            'anthropic-version: 2023-06-01',
            'Content-Type: application/json',
        ],
        $payload,
        static function (array $parsed) use ($emit): void {
            if (($parsed['type'] ?? '') !== 'content_block_delta') {
                return;
            }
            $delta = $parsed['delta'] ?? null;
            if (!is_array($delta) || ($delta['type'] ?? '') !== 'text_delta') {
                return;
            }
            $text = $delta['text'] ?? null;
            if (is_string($text) && $text !== '') {
                $emit($text);
            }
        }
    );
}

function stream_completion(
    array $config,
    string $system,
    array $messages,
    callable $emit
): void {
    switch ($config['provider']) {
        case 'openai':
            stream_openai($config['model'], $system, $messages, $emit);
            return;
        case 'anthropic':
            stream_anthropic($config['model'], $system, $messages, $emit);
            return;
        default:
            throw new RuntimeException(
                'unsupported provider "' . $config['provider'] . '" (expected openai or anthropic)'
            );
    }
}

function stream_provider_sse(
    string $url,
    array $headers,
    string $payload,
    callable $handleEvent
): void {
    $buffer = '';

    $ch = curl_init($url);
    if ($ch === false) {
        throw new RuntimeException('failed to initialize curl');
    }

    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$buffer, $handleEvent): int {
            $buffer .= $chunk;

            while (($lineEnd = strpos($buffer, "\n")) !== false) {
                $line = rtrim(substr($buffer, 0, $lineEnd), "\r");
                $buffer = substr($buffer, $lineEnd + 1);

                if (!str_starts_with($line, 'data: ')) {
                    continue;
                }

                $data = substr($line, 6);
                if ($data === '[DONE]') {
                    return strlen($chunk);
                }

                $parsed = json_decode($data, true);
                if (!is_array($parsed)) {
                    continue;
                }

                $handleEvent($parsed);
            }

            return strlen($chunk);
        },
    ]);

    $ok = curl_exec($ch);
    if ($ok === false) {
        $error = curl_error($ch);
        curl_close($ch);
        throw new RuntimeException($error !== '' ? $error : 'provider request failed');
    }

    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($status >= 400) {
        throw new RuntimeException('provider request failed (' . $status . ')');
    }
}
