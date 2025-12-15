#!/bin/bash
# Post-create script for Casys PML Playground

set -e

echo "Setting up Casys PML Playground..."

# Cache all Deno dependencies
echo "Caching Deno dependencies..."
deno cache mod.ts

# Verify Jupyter kernel is installed
echo "Verifying Deno Jupyter kernel..."
deno jupyter --install 2>/dev/null || true

# Create playground .env if not exists
if [ ! -f playground/.env ]; then
    echo "Creating playground/.env from example..."
    cp playground/.env.example playground/.env 2>/dev/null || true
fi

# Initialize database (run migrations)
echo "Initializing database..."
deno task db:migrate 2>/dev/null || echo "Note: db:migrate task not found, skipping"

echo ""
echo "Setup complete! You can now:"
echo "  1. Open notebooks in playground/notebooks/"
echo "  2. Run the MCP gateway: deno run --allow-all playground/examples/server.ts"
echo "  3. Start Jupyter Lab: jupyter lab --ip=0.0.0.0 --allow-root --no-browser"
echo ""
