#!/bin/sh
set -e

# Resolve any previously failed migrations so we can retry
npx prisma migrate resolve --rolled-back 20260226_add_autofix 2>/dev/null || true

# Apply all pending migrations
npx prisma migrate deploy

# Start the application
exec node src/app.js
