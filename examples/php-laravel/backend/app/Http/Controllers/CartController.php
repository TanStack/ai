<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Lunar\Facades\CartSession;
use Lunar\Models\Cart;
use Lunar\Models\ProductVariant;

class CartController extends Controller
{
    /**
     * Get the current cart
     */
    public function show(): JsonResponse
    {
        $cart = CartSession::current();

        if (!$cart) {
            return response()->json([
                'cart' => null,
                'items' => [],
                'total' => [
                    'value' => 0,
                    'formatted' => '0.00',
                ],
            ]);
        }

        return response()->json([
            'cart' => $cart,
            'items' => $cart->lines,
            'total' => $cart->total,
        ]);
    }

    /**
     * Add item to cart
     */
    public function addItem(Request $request): JsonResponse
    {
        $request->validate([
            'purchasable_id' => 'required|string',
            'quantity' => 'required|integer|min:1',
        ]);

        $cart = CartSession::current();

        if (!$cart) {
            $cart = CartSession::create();
        }

        // Find the purchasable (variant) by ID
        $purchasable = \Lunar\Models\ProductVariant::find($request->purchasable_id);
        
        if (!$purchasable) {
            return response()->json(['error' => 'Product variant not found'], 404);
        }

        $cart->add($purchasable, $request->quantity);

        return response()->json([
            'cart' => $cart->refresh(),
            'items' => $cart->lines,
            'total' => $cart->total,
        ]);
    }

    /**
     * Update cart item quantity
     */
    public function updateItem(Request $request, string $lineId): JsonResponse
    {
        $request->validate([
            'quantity' => 'required|integer|min:0',
        ]);

        $cart = CartSession::current();

        if (!$cart) {
            return response()->json(['error' => 'Cart not found'], 404);
        }

        $line = $cart->lines()->find($lineId);

        if (!$line) {
            return response()->json(['error' => 'Cart line not found'], 404);
        }

        if ($request->quantity === 0) {
            $line->delete();
        } else {
            $line->update([
                'quantity' => $request->quantity,
            ]);
        }

        return response()->json([
            'cart' => $cart->refresh(),
            'items' => $cart->lines,
            'total' => $cart->total,
        ]);
    }

    /**
     * Remove item from cart
     */
    public function removeItem(string $lineId): JsonResponse
    {
        $cart = CartSession::current();

        if (!$cart) {
            return response()->json(['error' => 'Cart not found'], 404);
        }

        $line = $cart->lines()->find($lineId);

        if (!$line) {
            return response()->json(['error' => 'Cart line not found'], 404);
        }

        $line->delete();

        return response()->json([
            'cart' => $cart->refresh(),
            'items' => $cart->lines,
            'total' => $cart->total,
        ]);
    }
}
