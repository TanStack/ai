<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withProviders([
        \App\Providers\AppServiceProvider::class,
        \Cartalyst\Converter\Laravel\ConverterServiceProvider::class,
        \Kalnoy\Nestedset\NestedSetServiceProvider::class,
        \Lunar\LunarServiceProvider::class,
    ])
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        health: '/health',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->api(prepend: [
            \Illuminate\Http\Middleware\HandleCors::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
