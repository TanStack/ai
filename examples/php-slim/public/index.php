<?php

// Simple router for PHP built-in server
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$requestMethod = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Route to appropriate server based on path
if (strpos($requestUri, '/openai') === 0 || strpos($requestUri, '/openai') !== false) {
    $_SERVER['REQUEST_URI'] = str_replace('/openai', '', $requestUri);
    require __DIR__ . '/openai-server.php';
} else {
    require __DIR__ . '/anthropic-server.php';
}

