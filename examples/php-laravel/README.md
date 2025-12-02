# TanStack AI - Laravel + Lunar E-Commerce Example

This example demonstrates how to use TanStack AI with a Laravel 11+ backend powered by Lunar (headless e-Commerce) and a React frontend, showcasing an e-Commerce storefront with an AI sales assistant.

## Features

- ✅ Laravel 11+ backend with Lunar e-Commerce integration
- ✅ React frontend with product catalog and shopping cart
- ✅ AI-powered sales assistant chat (using TanStack AI)
- ✅ Server-Sent Events (SSE) streaming for real-time chat
- ✅ Support for both Anthropic and OpenAI providers
- ✅ Product browsing and cart management
- ✅ Uses TanStack AI PHP package for message conversion

## Prerequisites

- **PHP 8.2+** with Composer
- **Node.js 18+** with pnpm
- **SQLite** (default, for easy setup) or **MySQL 8.0+** / **PostgreSQL 9.4+** (for production)
- **Required PHP extensions:** exif, intl, bcmath, GD, pdo_sqlite (for SQLite)
- **Anthropic API Key** (for Anthropic provider)
- **OpenAI API Key** (for OpenAI provider)

> **Note:** Lunar officially supports MySQL and PostgreSQL. SQLite works for basic functionality in this example, but for production use or advanced Lunar features, consider using MySQL or PostgreSQL.

## Project Structure

```
php-laravel/
├── backend/                    # Laravel + Lunar application
│   ├── app/
│   │   ├── Http/
│   │   │   └── Controllers/
│   │   │       ├── ChatController.php      # AI chat endpoint
│   │   │       ├── ProductController.php  # Product API
│   │   │       └── CartController.php      # Cart API
│   │   ├── Models/
│   │   │   └── User.php                    # User model with LunarUser trait
│   │   └── Providers/
│   │       └── AppServiceProvider.php     # Lunar panel registration
│   ├── routes/
│   │   └── api.php                         # API routes
│   ├── config/
│   │   ├── cors.php
│   │   ├── database.php
│   │   └── services.php
│   ├── composer.json
│   └── .env.example
├── frontend/                   # React + Vite application
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── components/
│   │       ├── Chat.tsx                    # AI sales assistant
│   │       ├── ProductList.tsx            # Product catalog
│   │       └── Cart.tsx                   # Shopping cart
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## Setup Instructions

### 1. Install Dependencies

From the root directory:

```bash
pnpm run setup
```

Or install separately:

**Backend:**

```bash
cd backend
composer install
```

**Frontend:**

```bash
cd frontend
pnpm install
```

### 2. Configure Backend

1. Copy the environment example file:

   ```bash
   cd backend
   cp .env.example .env
   ```

2. Generate Laravel application key:

   ```bash
   php artisan key:generate
   ```

3. Configure your database in `.env`:

   **For SQLite (default, easiest setup):**

   ```env
   DB_CONNECTION=sqlite
   # DB_DATABASE defaults to database/database.sqlite
   ```

   Then create the database directory and file:

   ```bash
   mkdir -p database
   touch database/database.sqlite
   ```

   **For MySQL/PostgreSQL (recommended for production):**

   ```env
   DB_CONNECTION=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_DATABASE=your_database_name
   DB_USERNAME=your_username
   DB_PASSWORD=your_password
   ```

4. Add your AI API keys:

   ```env
   ANTHROPIC_API_KEY=your-anthropic-api-key-here
   OPENAI_API_KEY=your-openai-api-key-here
   ```

### 3. Install and Configure Lunar

1. **Create the database file** (if using SQLite):

   ```bash
   cd backend
   mkdir -p database
   touch database/database.sqlite
   ```

2. Publish Lunar configuration files:

   ```bash
   php artisan vendor:publish --tag=lunar
   ```

3. Run Lunar installer:

   ```bash
   php artisan lunar:install
   ```

   This will:
   - Run all necessary migrations
   - Create the default admin user
   - Set up initial data

4. Create storage link (for product images):

   ```bash
   php artisan storage:link
   ```

5. Seed sample guitar products:

   ```bash
   php artisan db:seed --class=GuitarSeeder
   ```

   This will:
   - Copy guitar images from the `ts-react-chat` example
   - Create 7 guitar products with variants, prices, and images
   - Set up USD currency and tax class if they don't exist

   Alternatively, you can add products through the Lunar admin panel at `http://localhost:8020/lunar`.

### 4. Run the Application

**Terminal 1 - Backend (Laravel):**

```bash
cd backend
php artisan serve --host=0.0.0.0 --port=8020
```

Or use the npm script:

```bash
pnpm run backend:start
```

The backend will be available at `http://localhost:8020`
The Lunar admin panel will be available at `http://localhost:8020/lunar`

**Terminal 2 - Frontend (React):**

```bash
cd frontend
pnpm dev
```

Or use the npm script:

```bash
pnpm run frontend:dev
```

The frontend will be available at `http://localhost:3200`

## Usage

1. Open `http://localhost:3200` in your browser
2. Browse products in the **Products** tab
3. Add products to your cart
4. View your cart by clicking the cart icon in the header
5. Switch to the **Sales Assistant** tab to chat with the AI assistant

## Architecture

### E-Commerce Backend

The backend uses **Lunar** for e-Commerce functionality:

- **Products**: Managed through Lunar's product system
- **Cart**: Uses Lunar's cart session management
- **Variants**: Products can have multiple variants (sizes, colors, etc.)
- **Pricing**: Supports multiple currencies and price tiers

### AI Chat Backend

The chat functionality uses Laravel's `response()->stream()` for SSE streaming:

- Converts TanStack AI message format to provider format using `MessageFormatters`
- Streams provider events and converts them to `StreamChunk` format using `StreamChunkConverter`
- Formats chunks as SSE data lines using `SSEFormatter`
- Sends `[DONE]` marker before stream completion

### Frontend

- **ProductList**: Fetches and displays products from the API
- **Cart**: Manages cart state and syncs with backend
- **Chat**: AI sales assistant using `@tanstack/ai-react` hook

### API Endpoints

**Products:**

- `GET /api/products` - List all products
- `GET /api/products/{id}` - Get single product

**Cart:**

- `GET /api/cart` - Get current cart
- `POST /api/cart/items` - Add item to cart
- `PUT /api/cart/items/{lineId}` - Update cart item quantity
- `DELETE /api/cart/items/{lineId}` - Remove item from cart

**Chat:**

- `POST /api/chat` - Stream AI chat responses (SSE)

## Provider Selection

By default, the example uses Anthropic. To use OpenAI, modify the frontend connection or pass provider in the request:

```json
{
  "messages": [...],
  "data": {
    "provider": "openai",
    "model": "gpt-4o"
  }
}
```

## CORS Configuration

CORS is configured in `backend/config/cors.php` to allow requests from the frontend dev server (`localhost:3200`). For production, update the `allowed_origins` array.

## Error Handling

- Backend errors are converted to error `StreamChunk` format using `StreamChunkConverter::convertError()`
- Frontend displays errors in the chat interface
- Network errors are handled by the `useChat` hook
- Product loading errors show helpful messages

## Development

### Backend Development

The Laravel backend uses the local `tanstack/ai` PHP package from `packages/php/tanstack-ai`. Changes to the PHP package will be reflected immediately after running `composer update tanstack/ai`.

### Frontend Development

The React frontend uses workspace dependencies for `@tanstack/ai-react` and `@tanstack/ai-client`. Changes to these packages will be reflected after restarting the dev server.

### Adding Products

**Option 1: Use the Seeder (Recommended for Quick Start)**

Run the guitar products seeder:

```bash
php artisan db:seed --class=GuitarSeeder
```

This will create 7 guitar products with images, variants, and pricing.

**Option 2: Use the Lunar Admin Panel**

1. Navigate to `http://localhost:8020/lunar`
2. Log in with the admin credentials created during installation
3. Go to Products → Create Product
4. Fill in product details, variants, and pricing
5. Products will appear in the frontend automatically

## Troubleshooting

**CORS Errors:**

- Ensure the backend CORS config includes your frontend URL
- Check that both servers are running on the expected ports

**API Key Errors:**

- Verify your `.env` file has the correct API keys
- Check that the keys are not wrapped in quotes
- Ensure the API keys have the correct format (Anthropic: `sk-ant-...`, OpenAI: `sk-...`)

**Database Errors:**

- **SQLite:** Ensure `database/database.sqlite` file exists and is writable
- **MySQL/PostgreSQL:** Ensure your database server is running and accessible
- Verify database credentials in `.env`
- Run migrations: `php artisan migrate`
- If using SQLite and getting foreign key constraint errors, ensure `DB_FOREIGN_KEYS=true` in `.env`

**Lunar Installation Issues:**

- Ensure all required PHP extensions are installed
- Check that database connection is working
- Verify Laravel version is 11+

**No Products Showing:**

- Check that products exist in the database
- Verify products have `status = 'published'`
- Ensure products have at least one variant
- Check browser console for API errors

**Streaming Not Working:**

- Check browser console for errors
- Verify the backend is receiving requests (check Laravel logs)
- Ensure SSE headers are being sent correctly

## Next Steps

This example provides a foundation for building an AI-powered e-Commerce store. Future enhancements could include:

- Integrating the AI assistant with product search and recommendations
- Adding tool functions for cart operations (add to cart, view cart, etc.)
- Implementing product filtering and search
- Adding user authentication and order management
- Integrating payment processing

## See Also

- [TanStack AI Documentation](../../../docs/)
- [PHP Package Documentation](../../../packages/php/tanstack-ai/README.md)
- [Lunar Documentation](https://docs.lunarphp.io/)
- [Laravel Documentation](https://laravel.com/docs/11.x)
