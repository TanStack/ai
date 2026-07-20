<?php

declare(strict_types=1);

function text_from_message(array $message): string
{
    if (!empty($message['parts']) && is_array($message['parts'])) {
        $parts = [];
        foreach ($message['parts'] as $part) {
            if (!is_array($part)) {
                continue;
            }
            if (($part['type'] ?? '') === 'text' && is_string($part['content'] ?? null) && $part['content'] !== '') {
                $parts[] = $part['content'];
            }
        }
        if ($parts !== []) {
            return implode('', $parts);
        }
    }

    if (!array_key_exists('content', $message)) {
        return '';
    }

    $content = $message['content'];

    if (is_string($content)) {
        return $content;
    }

    if (is_array($content)) {
        $parts = [];
        foreach ($content as $item) {
            if (!is_array($item)) {
                continue;
            }
            if (($item['type'] ?? '') === 'text' && is_string($item['text'] ?? null)) {
                $parts[] = $item['text'];
            }
        }
        return implode('', $parts);
    }

    return trim((string) $content);
}

function to_chat_messages(array $messages): array
{
    $system = '';
    $chat = [];

    foreach ($messages as $message) {
        if (!is_array($message)) {
            continue;
        }

        $role = is_string($message['role'] ?? null) ? $message['role'] : '';
        switch ($role) {
            case 'developer':
                $role = 'system';
                break;
            case 'tool':
            case 'reasoning':
                continue 2;
        }

        $text = text_from_message($message);
        if ($text === '') {
            continue;
        }

        switch ($role) {
            case 'system':
                $system = $system === '' ? $text : $system . "\n\n" . $text;
                break;
            case 'user':
            case 'assistant':
                $chat[] = ['role' => $role, 'content' => $text];
                break;
        }
    }

    return [$system, $chat];
}
