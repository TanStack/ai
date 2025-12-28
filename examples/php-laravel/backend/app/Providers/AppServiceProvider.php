<?php

declare(strict_types=1);

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Lunar admin panel is optional for API-only setups
        // Products can be managed via API endpoints or seeders
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
