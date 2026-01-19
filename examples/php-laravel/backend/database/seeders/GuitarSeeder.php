<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\File;
use Lunar\Models\Product;
use Lunar\Models\ProductVariant;
use Lunar\Models\ProductType;
use Lunar\Models\Currency;
use Lunar\Models\TaxClass;
use Lunar\Models\Price;

class GuitarSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Get or create currency (USD) - use DB facade to avoid Laravel 11 compatibility issues
        $currencyId = \DB::table('lunar_currencies')->where('code', 'USD')->value('id');
        if (!$currencyId) {
            $currencyId = \DB::table('lunar_currencies')->insertGetId([
                'code' => 'USD',
                'name' => 'US Dollar',
                'exchange_rate' => 1.0,
                'decimal_places' => 2,
                'enabled' => true,
                'default' => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // Get or create tax class - use DB facade
        $taxClassId = \DB::table('lunar_tax_classes')->where('name', 'Standard Tax')->value('id');
        if (!$taxClassId) {
            $taxClassId = \DB::table('lunar_tax_classes')->insertGetId([
                'name' => 'Standard Tax',
                'default' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // Get or create product type - use DB facade
        $productTypeId = \DB::table('lunar_product_types')->where('name', 'Guitar')->value('id');
        if (!$productTypeId) {
            $productTypeId = \DB::table('lunar_product_types')->insertGetId([
                'name' => 'Guitar',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        // Define guitar products
        $guitars = [
            [
                'name' => 'TanStack Ukelele',
                'image' => 'example-ukelele-tanstack.jpg',
                'description' => "Introducing the TanStack Signature Ukulele—a beautifully handcrafted concert ukulele that combines exceptional sound quality with distinctive style. Featuring a warm, resonant koa-wood body with natural grain patterns, this instrument delivers the rich, mellow tones Hawaii is famous for. The exclusive TanStack palm tree inlay on the soundhole adds a unique touch of island flair, while the matching branded headstock makes this a true collector's piece for developers and musicians alike. Whether you're a beginner looking for a quality starter instrument or an experienced player wanting something special, the TanStack Ukulele brings together craftsmanship, character, and that unmistakable tropical spirit.",
                'shortDescription' => 'Premium koa-wood ukulele featuring exclusive TanStack branding, perfect for beach vibes and island-inspired melodies.',
                'price' => 29900, // $299.00 in cents
            ],
            [
                'name' => 'Superhero Guitar',
                'image' => 'example-guitar-superhero.jpg',
                'description' => "The Superhero Guitar is a bold black electric guitar that stands out with its unique superhero logo design. Its sleek, high-gloss finish and powerful pickups make it perfect for high-energy performances. The guitar's ergonomic body and fast neck profile ensure comfortable playability for hours on end.",
                'shortDescription' => 'A bold black electric guitar with a unique superhero logo, high-gloss finish, and powerful pickups.',
                'price' => 69900,
            ],
            [
                'name' => 'Motherboard Guitar',
                'image' => 'example-guitar-motherboard.jpg',
                'description' => "This guitar is a tribute to the motherboard of a computer. It's a unique and stylish instrument that will make you feel like a hacker. The intricate circuit-inspired design features actual LED lights that pulse with your playing intensity, while the neck is inlaid with binary code patterns that glow under stage lights. Each pickup has been custom-wound to produce tones ranging from clean digital precision to glitched-out distortion, perfect for electronic music fusion. The Motherboard Guitar seamlessly bridges the gap between traditional craftsmanship and cutting-edge technology, making it the ultimate instrument for the digital age musician.",
                'shortDescription' => 'A tech-inspired electric guitar featuring LED lights and binary code inlays that glow under stage lights.',
                'price' => 64900,
            ],
            [
                'name' => 'Racing Guitar',
                'image' => 'example-guitar-racing.jpg',
                'description' => "Engineered for speed and precision, the Racing Guitar embodies the spirit of motorsport in every curve and contour. Its aerodynamic body, painted in classic racing stripes and high-gloss finish, is crafted from lightweight materials that allow for effortless play during extended performances. The custom low-action setup and streamlined neck profile enable lightning-fast fretwork, while specially designed pickups deliver a high-octane tone that cuts through any mix. Built with performance-grade hardware including racing-inspired control knobs and checkered flag inlays, this guitar isn't just played—it's driven to the limits of musical possibility.",
                'shortDescription' => 'A lightweight, aerodynamic guitar with racing stripes and a low-action setup designed for speed and precision.',
                'price' => 67900,
            ],
            [
                'name' => 'Steamer Trunk Guitar',
                'image' => 'example-guitar-steamer-trunk.jpg',
                'description' => 'The Steamer Trunk Guitar is a semi-hollow body instrument that exudes vintage charm and character. Crafted from reclaimed antique luggage wood, it features brass hardware that adds a touch of elegance and durability. The fretboard is adorned with a world map inlay, making it a unique piece that tells a story of travel and adventure.',
                'shortDescription' => 'A semi-hollow body guitar with brass hardware and a world map inlay, crafted from reclaimed antique luggage wood.',
                'price' => 62900,
            ],
            [
                'name' => "Travelin' Man Guitar",
                'image' => 'example-guitar-traveling.jpg',
                'description' => "The Travelin' Man Guitar is an acoustic masterpiece adorned with vintage postcards from around the world. Each postcard tells a story of adventure and wanderlust, making this guitar a unique piece of art. Its rich, resonant tones and comfortable playability make it perfect for musicians who love to travel and perform.",
                'shortDescription' => 'An acoustic guitar with vintage postcards, rich tones, and comfortable playability.',
                'price' => 49900,
            ],
            [
                'name' => 'Flowerly Love Guitar',
                'image' => 'example-guitar-flowers.jpg',
                'description' => "The Flowerly Love Guitar is an acoustic masterpiece adorned with intricate floral designs on its body. Each flower is hand-painted, adding a touch of nature's beauty to the instrument. Its warm, resonant tones make it perfect for both intimate performances and larger gatherings.",
                'shortDescription' => 'An acoustic guitar with hand-painted floral designs and warm, resonant tones.',
                'price' => 59900,
            ],
        ];

        // Copy images from product-images directory to Laravel storage
        $sourceImagePath = base_path('product-images');
        $targetImagePath = storage_path('app/public/products');

        if (!File::exists($targetImagePath)) {
            File::makeDirectory($targetImagePath, 0755, true);
        }

        $imagesCopied = 0;
        foreach ($guitars as $guitar) {
            $sourceFile = $sourceImagePath . '/' . $guitar['image'];
            $targetFile = $targetImagePath . '/' . $guitar['image'];

            if (File::exists($sourceFile)) {
                File::copy($sourceFile, $targetFile);
                $imagesCopied++;
            } else {
                $this->command->warn("Image not found: {$sourceFile}");
            }
        }

        if ($imagesCopied > 0) {
            $this->command->info("Copied {$imagesCopied} images to storage.");
        }

        // Create products
        foreach ($guitars as $guitar) {
            // Create product - use DB facade to bypass attribute casting
            try {
                $productId = \DB::table('lunar_products')->insertGetId([
                    'status' => 'published',
                    'product_type_id' => $productTypeId,
                    'attribute_data' => json_encode([
                        'name' => [
                            'en' => $guitar['name'],
                        ],
                        'description' => [
                            'en' => $guitar['description'],
                        ],
                    ]),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                
                $product = Product::find($productId);
                if (!$product) {
                    $this->command->error("Failed to retrieve product {$guitar['name']} after creation");
                    continue;
                }
                $product->refresh();
            } catch (\Exception $e) {
                $this->command->error("Failed to create product {$guitar['name']}: " . $e->getMessage());
                continue;
            }

            // Create variant using DB facade to bypass attribute casting issues
            try {
                $variantId = \DB::table('lunar_product_variants')->insertGetId([
                    'product_id' => $product->id,
                    'tax_class_id' => $taxClassId,
                    'sku' => 'GUITAR-' . strtoupper(str_replace(' ', '-', $guitar['name'])),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $variant = ProductVariant::find($variantId);
            } catch (\Exception $e) {
                $this->command->error("Failed to create variant for {$guitar['name']}: " . $e->getMessage());
                continue;
            }

            // Create price using DB facade
            try {
                \DB::table('lunar_prices')->insert([
                    'price' => $guitar['price'],
                    'currency_id' => $currencyId,
                    'priceable_type' => ProductVariant::class,
                    'priceable_id' => $variant->id,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            } catch (\Exception $e) {
                $this->command->error("Failed to create price for {$guitar['name']}: " . $e->getMessage());
                continue;
            }

            // Skip media attachment due to Laravel 11 compatibility issues with Lunar media library
            // The images are still copied to storage/app/public/products for manual attachment if needed
            // Products are created successfully without media attachments
        }

        $this->command->info('Guitar products seeded successfully!');
    }
}
