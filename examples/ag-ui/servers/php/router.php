<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/Agui.php';
require_once __DIR__ . '/lib/Messages.php';
require_once __DIR__ . '/lib/Providers.php';

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if ($method === 'OPTIONS') {
    cors_preflight();
    exit;
}

if ($path === '/health') {
    header('Content-Type: text/plain');
    http_response_code(200);
    echo 'ok';
    exit;
}

if ($path !== '/' || $method !== 'POST') {
    http_response_code($method === 'POST' ? 404 : 405);
    header('Content-Type: text/plain');
    echo $method === 'POST' ? 'not found' : 'method not allowed';
    exit;
}

$rawBody = file_get_contents('php://input');
if ($rawBody === false) {
    http_response_code(400);
    header('Content-Type: text/plain');
    echo 'failed to read body';
    exit;
}

$input = json_decode($rawBody, true);
if (!is_array($input)) {
    http_response_code(400);
    header('Content-Type: text/plain');
    echo 'invalid JSON body';
    exit;
}

$threadId = is_string($input['threadId'] ?? null) ? $input['threadId'] : '';
$runId = is_string($input['runId'] ?? null) ? $input['runId'] : '';
$messages = is_array($input['messages'] ?? null) ? $input['messages'] : [];

if ($threadId === '' || $runId === '') {
    http_response_code(400);
    header('Content-Type: text/plain');
    echo 'threadId and runId are required';
    exit;
}

$config = provider_from_input($input);
[$system, $chatMessages] = to_chat_messages($messages);

if ($chatMessages === []) {
    stream_error_only($threadId, $runId, 'no user or assistant messages to send');
    exit;
}

stream_text($threadId, $runId, static function (callable $emit) use ($config, $system, $chatMessages): void {
    stream_completion($config, $system, $chatMessages, $emit);
});
