<?php

return [
    'paths' => ['api/*', 'health'],

    'allowed_methods' => ['*'],

    'allowed_origins' => [
        'http://localhost:3200',
        'http://127.0.0.1:3200',
    ],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,
];
