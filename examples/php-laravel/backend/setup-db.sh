#!/bin/bash
# Don't exit on error - we handle errors explicitly below
set +e

# Navigate to backend directory (script should be run from project root or backend dir)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🔧 Setting up Laravel environment..."

# Check if composer dependencies are installed
if [ ! -f vendor/autoload.php ]; then
    echo "❌ ERROR: Composer dependencies not installed!"
    echo "   Please run 'composer install' or 'pnpm run backend:install' first."
    echo "   Or run 'pnpm run setup' which will install dependencies automatically."
    exit 1
fi

# Copy .env.example to .env if .env doesn't exist
if [ ! -f .env ]; then
    if [ ! -f .env.example ]; then
        echo "❌ Error: .env.example file not found!"
        exit 1
    fi
    echo "📋 Copying .env.example to .env..."
    cp .env.example .env
else
    echo "✅ .env file already exists"
fi

# Ensure DB_CONNECTION is set to sqlite in .env
if ! grep -q "^DB_CONNECTION=sqlite" .env; then
    echo "📝 Setting DB_CONNECTION=sqlite in .env..."
    # Remove any existing DB_CONNECTION line and add sqlite
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS uses BSD sed
        sed -i '' '/^DB_CONNECTION=/d' .env
    else
        # Linux uses GNU sed
        sed -i '/^DB_CONNECTION=/d' .env
    fi
    echo "DB_CONNECTION=sqlite" >> .env
fi

echo "🔑 Generating Laravel application key..."
php artisan key:generate --force

echo "💾 Creating SQLite database..."
mkdir -p database
touch database/database.sqlite

echo "📦 Publishing Lunar configuration..."
php artisan vendor:publish --tag=lunar --force

echo "🚀 Running database migrations..."
# Always try to run migrations - Laravel will skip if already run
MIGRATE_OUTPUT=$(php artisan migrate --force 2>&1)
MIGRATE_EXIT=$?

# Filter out harmless Lunar/Laravel 11 compatibility warnings
echo "$MIGRATE_OUTPUT" | grep -v "getTable does not exist" || true

# Verify migrations succeeded by checking for Lunar tables
if [ -f database/database.sqlite ]; then
    TABLES=$(sqlite3 database/database.sqlite "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'lunar_%';" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$TABLES" -gt 0 ]; then
        echo "✅ Migrations complete - found $TABLES Lunar tables"
    elif [ $MIGRATE_EXIT -ne 0 ]; then
        echo "❌ ERROR: Migrations failed and no Lunar tables found!"
        echo "   Check the migration output above for errors."
        exit 1
    fi
else
    echo "❌ ERROR: Database file not found after migrations!"
    exit 1
fi

echo "🔗 Creating storage link..."
php artisan storage:link --force 2>&1 || echo "⚠️  Storage link may already exist, continuing..."

echo "🌱 Seeding guitar products..."
# Always delete existing products and reseed for a clean, reliable setup
if [ -f database/database.sqlite ]; then
    echo "   Clearing existing products..."
    sqlite3 database/database.sqlite "DELETE FROM lunar_products;" 2>/dev/null || true
fi

echo "   Running seeder (ignoring harmless Lunar/Laravel 11 compatibility warnings)..."
# Run seeder and filter out known harmless errors/warnings
SEED_OUTPUT=$(php artisan db:seed --class=GuitarSeeder 2>&1)
echo "$SEED_OUTPUT" | grep -v "originalFileName does not exist" | grep -v "CauserResolver" | grep -v "getTable does not exist" | grep -v "Trying to access array offset" || true

# Verify products were created
sleep 1  # Give DB a moment to commit
if [ -f database/database.sqlite ]; then
    PRODUCT_COUNT=$(sqlite3 database/database.sqlite "SELECT COUNT(*) FROM lunar_products;" 2>/dev/null | tr -d ' ' || echo "0")
    if [ "$PRODUCT_COUNT" -gt 0 ]; then
        echo "✅ Successfully seeded $PRODUCT_COUNT products!"
    else
        echo "❌ ERROR: Seeder completed but no products found in database!"
        echo "   This indicates a problem with the seeding process."
        echo "   Check the seeder output above for errors."
        exit 1
    fi
else
    echo "❌ ERROR: Database file not found after seeding!"
    exit 1
fi

echo "✅ Database setup complete!"
