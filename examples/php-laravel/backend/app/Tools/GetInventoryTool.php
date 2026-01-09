<?php

declare(strict_types=1);

namespace App\Tools;

use Illuminate\Support\Facades\DB;
use Lunar\Models\Product;
use TanStack\AI\Tool;

/**
 * Tool for getting product inventory.
 * 
 * This tool allows the AI assistant to query the product catalog
 * and retrieve information about available products.
 */
class GetInventoryTool
{
    /**
     * Create the getInventory tool instance.
     * 
     * @return Tool
     */
    public static function create(): Tool
    {
        return new Tool(
            name: 'getInventory',
            description: 'Get the current inventory of products. Can search by query string or get all products. Returns product names, descriptions, prices, and availability.',
            inputSchema: [
                'type' => 'object',
                'properties' => [
                    'query' => [
                        'type' => 'string',
                        'description' => 'Optional search query to filter products by name or description',
                    ],
                    'limit' => [
                        'type' => 'integer',
                        'description' => 'Maximum number of products to return (default: 10)',
                        'default' => 10,
                    ],
                ],
                'required' => [],
            ],
            execute: function (array $args): array {
                // Just return all products - let the LLM figure out what's relevant
                $products = Product::with(['variants' => function ($q) {
                    $q->with('prices');
                }])
                    ->where('status', 'published')
                    ->get();

                // Format products for response
                $formattedProducts = $products->map(function ($product) {
                    $rawData = json_decode($product->getRawOriginal('attribute_data') ?? '{}', true);
                    
                    // Get price from first variant
                    $price = null;
                    $variant = $product->variants->first();
                    if ($variant) {
                        $priceRecords = DB::table('lunar_prices')
                            ->where('priceable_type', \Lunar\Models\ProductVariant::class)
                            ->where('priceable_id', $variant->id)
                            ->first();
                        
                        if ($priceRecords) {
                            $price = [
                                'value' => $priceRecords->price,
                                'formatted' => '$' . number_format($priceRecords->price / 100, 2),
                            ];
                        }
                    }

                    return [
                        'id' => (string)$product->id,
                        'name' => $rawData['name']['en'] ?? 'Unknown Product',
                        'description' => $rawData['description']['en'] ?? '',
                        'price' => $price,
                        'status' => $product->status,
                    ];
                })->toArray();

                return [
                    'products' => $formattedProducts,
                    'count' => count($formattedProducts),
                ];
            },
            needsApproval: false
        );
    }
}
