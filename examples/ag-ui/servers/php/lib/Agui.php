<?php

declare(strict_types=1);

const DEFAULT_OPENAI_MODEL = 'gpt-4o';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

function props_from_input(array $input): array
{
    if (!empty($input['forwardedProps']) && is_array($input['forwardedProps'])) {
        return $input['forwardedProps'];
    }

    if (!empty($input['data']) && is_array($input['data'])) {
        return $input['data'];
    }

    return [];
}

function provider_from_input(array $input): array
{
    $props = props_from_input($input);
    $provider = is_string($props['provider'] ?? null) && $props['provider'] !== ''
        ? $props['provider']
        : 'openai';
    $model = is_string($props['model'] ?? null) ? $props['model'] : '';

    if ($provider === 'anthropic') {
        return [
            'provider' => 'anthropic',
            'model' => $model !== '' ? $model : DEFAULT_ANTHROPIC_MODEL,
        ];
    }

    return [
        'provider' => 'openai',
        'model' => $model !== '' ? $model : DEFAULT_OPENAI_MODEL,
    ];
}

function sse_event(array $payload): string
{
    return 'data: ' . json_encode($payload, JSON_UNESCAPED_UNICODE) . "\n\n";
}

function sse_done(): string
{
    return "data: [DONE]\n\n";
}

function run_started(string $threadId, string $runId): string
{
    return sse_event([
        'type' => 'RUN_STARTED',
        'threadId' => $threadId,
        'runId' => $runId,
    ]);
}

function text_message_start(string $messageId): string
{
    return sse_event([
        'type' => 'TEXT_MESSAGE_START',
        'messageId' => $messageId,
        'role' => 'assistant',
    ]);
}

function text_message_content(string $messageId, string $delta): string
{
    return sse_event([
        'type' => 'TEXT_MESSAGE_CONTENT',
        'messageId' => $messageId,
        'delta' => $delta,
    ]);
}

function text_message_end(string $messageId): string
{
    return sse_event([
        'type' => 'TEXT_MESSAGE_END',
        'messageId' => $messageId,
    ]);
}

function run_finished(string $threadId, string $runId): string
{
    return sse_event([
        'type' => 'RUN_FINISHED',
        'threadId' => $threadId,
        'runId' => $runId,
        'finishReason' => 'stop',
    ]);
}

function run_error(string $threadId, string $runId, string $message): string
{
    return sse_event([
        'type' => 'RUN_ERROR',
        'threadId' => $threadId,
        'runId' => $runId,
        'error' => ['message' => $message],
    ]);
}

function begin_sse(): void
{
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    header('Access-Control-Allow-Origin: *');
    http_response_code(200);
}

function write_sse(string $frame): void
{
    echo $frame;
    if (ob_get_level() > 0) {
        ob_flush();
    }
    flush();
}

function cors_preflight(): void
{
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    http_response_code(204);
}

function stream_text(
    string $threadId,
    string $runId,
    callable $stream
): void {
    begin_sse();
    $messageId = 'msg-' . $runId;

    write_sse(run_started($threadId, $runId));
    write_sse(text_message_start($messageId));

    $emit = static function (string $delta) use ($messageId): void {
        if ($delta === '') {
            return;
        }
        write_sse(text_message_content($messageId, $delta));
    };

    try {
        $stream($emit);
        write_sse(text_message_end($messageId));
        write_sse(run_finished($threadId, $runId));
        write_sse(sse_done());
    } catch (Throwable $error) {
        error_log('[php] chat error: ' . $error->getMessage());
        write_sse(run_error($threadId, $runId, $error->getMessage()));
        write_sse(sse_done());
    }
}

function stream_error_only(string $threadId, string $runId, string $message): void
{
    begin_sse();
    write_sse(run_started($threadId, $runId));
    write_sse(run_error($threadId, $runId, $message));
    write_sse(sse_done());
}
