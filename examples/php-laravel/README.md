# TanStack AI - Laravel + Lunar E-Commerce Example

A full-featured guitar shop built with Laravel 11+ and Lunar e-Commerce, featuring an AI sales assistant powered by TanStack AI. The AI assistant can query product inventory using tools and provide personalized recommendations.

## Features

- ✅ **Laravel 11+ backend** with Lunar e-Commerce integration
- ✅ **React frontend** with beautiful product catalog and shopping cart
- ✅ **AI sales assistant** with agentic tool calling (getInventory)
- ✅ **Real-time streaming** with Server-Sent Events (SSE)
- ✅ **Sidebar chat interface** - always visible and ready to help
- ✅ **Automatic tool execution** - AI can query inventory and provide recommendations
- ✅ **Support for Anthropic and OpenAI** providers
- ✅ **Product browsing** with images, descriptions, and pricing
- ✅ **Shopping cart management** with add/update/remove functionality
- ✅ **One-command setup** - automated database setup and product seeding

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
├── backend/                              # Laravel + Lunar application
│   ├── app/
│   │   ├── Http/
│   │   │   └── Controllers/
│   │   │       ├── ChatController.php    # AI chat with agentic flow
│   │   │       ├── ProductController.php # Product API with images
│   │   │       └── CartController.php    # Cart API
│   │   ├── Tools/
│   │   │   └── GetInventoryTool.php      # Tool for querying products
│   │   ├── Models/
│   │   │   └── User.php                  # User model with LunarUser trait
│   │   └── Providers/
│   │       └── AppServiceProvider.php    # Lunar panel registration
│   ├── database/
│   │   └── seeders/
│   │       └── GuitarSeeder.php          # Seeds guitar products
│   ├── routes/
│   │   └── api.php                       # API routes
│   ├── config/
│   │   ├── cors.php
│   │   ├── database.php
│   │   └── services.php
│   ├── storage/
│   │   └── app/
│   │       └── public/
│   │           └── products/              # Product images
│   ├── setup-db.sh                       # Automated database setup
│   ├── composer.json
│   └── .env.example
├── frontend/                             # React + Vite application
│   ├── src/
│   │   ├── App.tsx                       # Sidebar layout
│   │   ├── main.tsx
│   │   ├── styles.css                    # Beautiful modern styling
│   │   └── components/
│   │       ├── Chat.tsx                  # AI sales assistant sidebar
│   │       ├── ProductList.tsx           # Product grid with images
│   │       └── Cart.tsx                  # Shopping cart drawer
│   ├── package.json
│   └── vite.config.ts
├── package.json                          # Scripts: setup, start
└── README.md
```

## Quick Start

### 1. Install Dependencies and Setup

From the `php-laravel` directory, run the one-command setup:

```bash
pnpm run setup
```

This will:

- Install Composer dependencies (PHP backend)
- Install npm dependencies (React frontend)
- Set up the SQLite database
- Run migrations
- Seed sample guitar products with images
- Create storage links

### 2. Configure API Keys

Copy the environment file and add your API keys:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and add your API keys:

```env
ANTHROPIC_API_KEY=your-anthropic-api-key-here
OPENAI_API_KEY=your-openai-api-key-here  # Optional
```

### 3. Start the Application

From the `php-laravel` directory:

```bash
pnpm start
```

This starts both the Laravel backend (port 8020) and React frontend (port 3200) concurrently.

**That's it!** Open `http://localhost:3200/` to see the guitar shop with AI sales assistant.

---

## Manual Setup (Alternative)

If you prefer to set things up manually:

### 1. Install Dependencies

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

1. Copy environment file:

   ```bash
   cd backend
   cp .env.example .env
   php artisan key:generate
   ```

2. Configure database in `.env` (SQLite by default):

   ```env
   DB_CONNECTION=sqlite
   ```

3. Add API keys to `.env`:
   ```env
   ANTHROPIC_API_KEY=your-anthropic-api-key-here
   OPENAI_API_KEY=your-openai-api-key-here
   ```

### 3. Setup Database

```bash
cd backend
./setup-db.sh
```

This script:

- Creates the SQLite database if needed
- Publishes Lunar configuration
- Runs migrations
- Creates storage link
- Seeds guitar products with images

### 4. Run Servers Separately

**Terminal 1 - Backend:**

```bash
pnpm run backend:start
```

Backend runs at `http://localhost:8020`
Lunar admin panel at `http://localhost:8020/lunar`

**Terminal 2 - Frontend:**

```bash
pnpm run frontend:dev
```

Frontend runs at `http://localhost:3200`

## Usage

1. Open `http://localhost:3200` in your browser
2. **Browse Products** - View the guitar collection in the main area with beautiful product cards, images, and pricing
3. **Chat with AI** - The sales assistant is always visible in the right sidebar. Ask questions like:
   - "What acoustic guitars do you have?"
   - "Recommend a guitar for a beginner"
   - "Tell me about the Motherboard Guitar"
4. **Add to Cart** - Click "Add to Cart" on any product
5. **View Cart** - Click the cart icon in the header to see your items

### AI Assistant Features

The AI sales assistant has access to a `getInventory` tool that allows it to:

- Query all available products
- Filter and recommend products based on customer needs
- Provide detailed information about specific guitars
- Help customers find their perfect guitar

The tool calling happens automatically using TanStack AI's agentic flow.

## Architecture

### E-Commerce Backend

The backend uses **Lunar** for e-Commerce functionality:

- **Products**: Managed through Lunar's product system
- **Cart**: Uses Lunar's cart session management
- **Variants**: Products can have multiple variants (sizes, colors, etc.)
- **Pricing**: Supports multiple currencies and price tiers

### AI Chat Backend

The chat functionality implements an **agentic flow** with automatic tool execution:

1. **ChatEngine** - Main orchestrator that manages the agent loop
   - Processes user messages
   - Detects when tools need to be called
   - Executes tools automatically
   - Continues the conversation with tool results

2. **Tool System**:
   - `Tool.php` - Base tool class with schema and execution
   - `GetInventoryTool.php` - Queries Lunar products and returns formatted data
   - `ToolExecutor.php` - Executes tool calls and formats results
   - `ToolCallManager.php` - Accumulates streaming tool call chunks

3. **Streaming**:
   - `StreamChunkConverter.php` - Converts provider events to TanStack AI format
   - `MessageFormatters.php` - Formats messages for different providers
   - `SSEFormatter.php` - Formats chunks as Server-Sent Events

4. **Agent Loop Strategy**:
   - `AgentLoopStrategies.php` - Controls when to continue the loop
   - Runs until the model doesn't call any more tools (finishReason is not "tool_calls")
   - Maximum of iterations to prevent infinite loops

### Frontend

- **App.tsx** - Main layout with sidebar design
- **ProductList** - Fetches and displays products with images from the API
- **Cart** - Manages cart state and syncs with backend
- **Chat** - AI sales assistant sidebar using `@tanstack/ai-react` hook

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

## What's Unique About This Example

This is one of the most comprehensive examples in the TanStack AI repository, demonstrating:

1. **Full Agentic Flow** - Complete implementation of tool calling with automatic execution and loop continuation
2. **Real E-Commerce Integration** - Uses Lunar, a production-ready headless e-commerce platform
3. **PHP Backend** - Shows how to build AI features with PHP/Laravel, not just TypeScript
4. **Beautiful UI** - Modern, responsive design with sidebar chat that's always accessible
5. **End-to-End Demo** - Everything works together: products, cart, AI assistant with tools

## Extending This Example

Some ideas for extending this example:

- **Add more tools**:
  - `addToCart(productId)` - AI can add items to cart
  - `searchProducts(query)` - Advanced product search
  - `checkInventory(productId)` - Check stock levels
  - `getRecommendations(style, budget)` - Personalized recommendations

- **Enhanced features**:
  - Product filtering and sorting
  - User authentication and order history
  - Payment processing integration
  - Product reviews and ratings
  - Wishlist functionality

- **AI improvements**:
  - Multi-turn conversations with memory
  - Image analysis (analyze guitar photos)
  - Sentiment analysis of customer queries
  - Personalization based on browsing history

## See Also

- [TanStack AI Documentation](../../../docs/)
- [PHP Package Documentation](../../../packages/php/tanstack-ai/README.md)
- [Lunar Documentation](https://docs.lunarphp.io/)
- [Laravel Documentation](https://laravel.com/docs/11.x)
