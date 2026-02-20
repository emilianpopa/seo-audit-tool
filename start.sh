#!/bin/sh
# Retry migrations until the database is reachable, then run the app.
# This handles Railway's container startup race condition where the DB
# isn't immediately reachable when the container first boots.

MAX_ATTEMPTS=10
ATTEMPT=0

echo "Running database migrations..."
until npx prisma migrate deploy 2>&1; do
  ATTEMPT=$((ATTEMPT + 1))
  if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
    echo "Migration failed after $MAX_ATTEMPTS attempts, starting app anyway..."
    break
  fi
  echo "Attempt $ATTEMPT failed, retrying in 3s..."
  sleep 3
done

echo "Starting application..."
exec "$@"
