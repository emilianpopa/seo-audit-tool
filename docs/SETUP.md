# SEO Audit Tool - Setup Guide

This guide will help you set up and run the SEO Audit Tool locally.

## Prerequisites

Ensure you have the following installed:
- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Docker** and **Docker Compose** (for PostgreSQL and Redis)
- **Git**

## Step-by-Step Setup

### 1. Navigate to Project Directory

```bash
cd C:/Dev/seo-audit-tool
```

### 2. Install Dependencies

```bash
npm install
```

This will install all required packages including:
- Express, Prisma, BullMQ, Axios, Cheerio, Puppeteer, and more

### 3. Set Up Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration. At minimum, you need:

```env
# Database
DATABASE_URL=postgresql://seouser:seopass@localhost:5432/seo_audit

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Google PageSpeed Insights API (get from: https://console.cloud.google.com)
GOOGLE_PAGESPEED_API_KEY=your_api_key_here

# Server
PORT=3000
NODE_ENV=development
```

### 4. Start PostgreSQL and Redis

Using Docker Compose (recommended):

```bash
docker-compose up -d
```

This will start:
- **PostgreSQL** on port 5432
- **Redis** on port 6379

Verify containers are running:

```bash
docker-compose ps
```

### 5. Set Up the Database

Run Prisma migrations to create database tables:

```bash
npm run prisma:generate
npm run prisma:migrate
```

You should see:
- Database schema created
- Prisma Client generated

Optionally, open Prisma Studio to view the database:

```bash
npm run prisma:studio
```

This opens a web UI at `http://localhost:5555`

### 6. Start the Application

You need to run TWO processes:

**Terminal 1 - API Server:**
```bash
npm run dev
```

You should see:
```
INFO: SEO Audit Tool API server started (port=3000)
INFO: PostgreSQL connected
INFO: Redis connected successfully
```

**Terminal 2 - Worker:**
```bash
npm run worker
```

You should see:
```
INFO: SEO Audit Worker started (queue=seo-audit-queue, concurrency=3)
```

### 7. Verify Installation

#### Check Health Endpoint

```bash
curl http://localhost:3000/api/health
```

Response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-14T...",
    "uptime": 12.34,
    "service": "seo-audit-tool",
    "version": "1.0.0"
  }
}
```

#### Check Detailed Health (with database and Redis)

```bash
curl http://localhost:3000/api/health/detailed
```

Response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "checks": {
      "database": { "status": "healthy", "message": "PostgreSQL connected" },
      "redis": { "status": "healthy", "message": "Redis connected" }
    }
  }
}
```

## Testing the SEO Audit

### 1. Start an Audit

```bash
curl -X POST http://localhost:3000/api/audit/start \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://example.com",
    "config": {
      "maxPages": 10,
      "crawlDepth": 2
    }
  }'
```

Response:
```json
{
  "success": true,
  "message": "Audit queued successfully",
  "data": {
    "auditId": "clxxx...",
    "status": "PENDING",
    "targetUrl": "https://example.com",
    "estimatedTime": "5-10 minutes",
    "createdAt": "2026-02-14T..."
  }
}
```

### 2. Check Audit Status

```bash
curl http://localhost:3000/api/audit/{auditId}/status
```

Response:
```json
{
  "success": true,
  "data": {
    "auditId": "clxxx...",
    "targetUrl": "https://example.com",
    "status": "IN_PROGRESS",
    "progress": 45,
    "startedAt": "2026-02-14T...",
    "createdAt": "2026-02-14T..."
  }
}
```

Status values:
- `PENDING` - Queued, not started yet
- `IN_PROGRESS` - Currently running (check `progress` field for %)
- `COMPLETED` - Finished successfully
- `FAILED` - Failed with error

### 3. Get Audit Report (when completed)

```bash
curl http://localhost:3000/api/audit/{auditId}/report
```

Response:
```json
{
  "success": true,
  "data": {
    "auditId": "clxxx...",
    "targetUrl": "https://example.com",
    "overallScore": 68,
    "scoreRating": "needs improvement",
    "completedAt": "2026-02-14T...",
    "categoryScores": { ... },
    "recommendations": [ ... ],
    "roadmap": { ... },
    "pagesAnalyzed": 10
  }
}
```

### 4. View Audit History

```bash
curl http://localhost:3000/api/audit/history?page=1&limit=10
```

## Troubleshooting

### Database Connection Error

**Error:** `Can't reach database server`

**Solution:**
1. Ensure Docker containers are running:
   ```bash
   docker-compose ps
   ```
2. Check DATABASE_URL in `.env` matches docker-compose.yml credentials
3. Restart containers:
   ```bash
   docker-compose restart postgres
   ```

### Redis Connection Error

**Error:** `Redis connection failed`

**Solution:**
1. Ensure Redis container is running:
   ```bash
   docker-compose ps
   ```
2. Check REDIS_HOST and REDIS_PORT in `.env`
3. Restart Redis:
   ```bash
   docker-compose restart redis
   ```

### Worker Not Processing Jobs

**Problem:** Audits stuck in PENDING status

**Solution:**
1. Check worker is running:
   ```bash
   # Should see worker process
   ps aux | grep seoAuditWorker
   ```
2. Check worker logs for errors
3. Restart worker:
   ```bash
   npm run worker
   ```

### Prisma Schema Changes

If you modify the schema:

```bash
# Create a new migration
npm run prisma:migrate

# Regenerate Prisma Client
npm run prisma:generate
```

## Development Tools

### View Database with Prisma Studio

```bash
npm run prisma:studio
```

Opens at `http://localhost:5555`

### View Redis Queue with Bull Board (optional)

Install Bull Board:
```bash
npm install @bull-board/express @bull-board/api
```

Add to your app.js and access at `/admin/queues`

### Run Tests

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests
npm run test:integration

# With coverage
npm run test:coverage
```

## Next Steps

You've completed **Phase 1: Foundation**! The system now has:
- ✅ Working API with health checks
- ✅ Database schema with Prisma
- ✅ Job queue with BullMQ
- ✅ Website crawler
- ✅ Basic audit workflow

**Phase 2** will add:
- 6 SEO analyzers (Technical, On-Page, Content, Performance, Authority, Local)
- Scoring engine
- Recommendation generation

See the full implementation plan at: `C:/Users/emili/.claude/plans/crystalline-wondering-finch.md`

## Useful Commands

```bash
# Development
npm run dev              # Start API server (with auto-reload)
npm run worker           # Start worker
npm start                # Start API server (production)

# Database
npm run prisma:generate  # Generate Prisma Client
npm run prisma:migrate   # Run migrations
npm run prisma:studio    # Open Prisma Studio

# Code Quality
npm run lint             # Run ESLint
npm run format           # Format with Prettier

# Testing
npm test                 # Run all tests
npm run test:coverage    # Run tests with coverage

# Docker
docker-compose up -d     # Start PostgreSQL + Redis
docker-compose down      # Stop containers
docker-compose logs -f   # View logs
docker-compose ps        # List containers
```

## Getting Help

- Check logs in the terminal running the API/worker
- Use Prisma Studio to inspect database
- Check Docker logs: `docker-compose logs postgres` or `docker-compose logs redis`
- Refer to the implementation plan for architecture details

## Support

For issues or questions, create a GitHub issue or refer to the documentation in `/docs`.
