<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ChatController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\CartController;

// Chat endpoint
Route::post('/chat', [ChatController::class, 'chat']);

// Product endpoints
Route::get('/products', [ProductController::class, 'index']);
Route::get('/products/{id}', [ProductController::class, 'show']);

// Cart endpoints
Route::get('/cart', [CartController::class, 'show']);
Route::post('/cart/items', [CartController::class, 'addItem']);
Route::put('/cart/items/{lineId}', [CartController::class, 'updateItem']);
Route::delete('/cart/items/{lineId}', [CartController::class, 'removeItem']);
