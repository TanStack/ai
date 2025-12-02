<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Lunar\Models\Product;

class ProductController extends Controller
{
    /**
     * Get all products
     */
    public function index(Request $request): JsonResponse
    {
        $query = Product::with(['variants' => function ($q) {
            $q->with('prices');
        }])
            ->where('status', 'published');
        
        $perPage = $request->get('per_page', 12);
        $page = $request->get('page', 1);
        $total = $query->count();
        $products = $query->skip(($page - 1) * $perPage)->take($perPage)->get();

        // Build response manually to avoid attribute_data casting issues
        $data = $products->map(function ($product) {
            $rawData = json_decode($product->getRawOriginal('attribute_data') ?? '{}', true);
            
            return [
                'id' => $product->id,
                'attribute_data' => $rawData,
                'status' => $product->status,
                'variants' => $product->variants->map(function ($variant) {
                    // Load prices directly from database
                    $priceRecords = DB::table('lunar_prices')
                        ->where('priceable_type', \Lunar\Models\ProductVariant::class)
                        ->where('priceable_id', $variant->id)
                        ->get();
                    
                    $prices = $priceRecords->map(function ($price) {
                        return [
                            'price' => [
                                'value' => $price->price,
                                'formatted' => '$' . number_format($price->price / 100, 2),
                            ],
                        ];
                    });
                    
                    return [
                        'id' => (string)$variant->id,
                        'sku' => $variant->sku,
                        'prices' => $prices->toArray(),
                    ];
                }),
            ];
        });

        return response()->json([
            'current_page' => $page,
            'data' => $data,
            'total' => $total,
            'per_page' => $perPage,
            'last_page' => ceil($total / $perPage),
        ], 200, [], JSON_UNESCAPED_SLASHES)->header('Content-Type', 'application/json');
    }

    /**
     * Get a single product
     */
    public function show(string $id): JsonResponse
    {
        $product = Product::with(['variants', 'thumbnail', 'images'])
            ->where('status', 'published')
            ->findOrFail($id);

        return response()->json($product);
    }
}
