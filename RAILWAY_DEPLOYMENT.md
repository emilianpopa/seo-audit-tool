# Railway Deployment Guide - SEO Audit Tool

## Quick Deployment (~10 minutes)

### Prerequisites
- GitHub account
- Railway account (sign up at https://railway.app)
- Google PageSpeed API key (get from https://console.cloud.google.com)

---

## Step 1: Push Code to GitHub

```bash
cd C:\Dev\seo-audit-tool

# Initialize git (if not already done)
git init

# Add all files
git add .

# Commit
git commit -m "Initial commit - SEO Audit Tool"

# Create repository on GitHub (via web interface)
# Then connect and push:
git remote add origin https://github.com/YOUR_USERNAME/seo-audit-tool.git
git branch -M main
git push -u origin main
```

---

## Step 2: Create Railway Project

1. Go to https://railway.app
2. Click **"Start a New Project"**
3. Select **"Deploy from GitHub repo"**
4. Authorize Railway to access your GitHub repositories
5. Select **seo-audit-tool** repository

---

## Step 3: Add PostgreSQL Database

1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Railway will automatically create a PostgreSQL instance
4. Copy the **DATABASE_URL** (you'll need it later)

---

## Step 4: Add Redis

1. Click **"+ New"** again
2. Select **"Database"** → **"Redis"**
3. Railway will automatically create a Redis instance
4. Copy the **REDIS_URL** (you'll need it later)

---

## Step 5: Configure API Service (Main App)

1. Click on your **main service** (the one deployed from GitHub)
2. Go to **"Settings"** tab
3. Under **"Service Name"**, rename to: `seo-audit-api`
4. Under **"Root Directory"**, leave as: `/`
5. Under **"Start Command"**, set to: `npx prisma migrate deploy && node src/app.js`

---

## Step 6: Add Environment Variables (API Service)

In the **seo-audit-api** service, go to **"Variables"** tab and add:

```env
NODE_ENV=production
PORT=3000

# Database (use the connection string from Step 3)
DATABASE_URL=postgresql://postgres:...@...railway.app/railway

# Redis (use the connection string from Step 4)
REDIS_URL=redis://default:...@...railway.app:6379

# Google PageSpeed API
GOOGLE_PAGESPEED_API_KEY=your_google_api_key_here

# Security
CORS_ORIGIN=*

# Rate Limits
API_RATE_LIMIT_WINDOW_MS=900000
API_RATE_LIMIT_MAX=100
AUDIT_RATE_LIMIT_MAX=5

# Logging
LOG_LEVEL=info

# Worker
WORKER_CONCURRENCY=2
MAX_CRAWL_PAGES=50
MAX_CRAWL_DEPTH=3
```

**Important:** Replace `your_google_api_key_here` with your actual Google PageSpeed Insights API key.

---

## Step 7: Create Worker Service

1. Click **"+ New"** in your Railway project
2. Select **"GitHub Repo"** → Select **seo-audit-tool** again
3. Railway will create a second service
4. Rename this service to: `seo-audit-worker`
5. Under **"Start Command"**, set to: `node src/workers/seoAuditWorker.js`

---

## Step 8: Add Environment Variables (Worker Service)

In the **seo-audit-worker** service, add the **SAME environment variables** as Step 6:

```env
NODE_ENV=production

# Database (same as API)
DATABASE_URL=postgresql://postgres:...@...railway.app/railway

# Redis (same as API)
REDIS_URL=redis://default:...@...railway.app:6379

# Google PageSpeed API
GOOGLE_PAGESPEED_API_KEY=your_google_api_key_here

# Worker
WORKER_CONCURRENCY=2
MAX_CRAWL_PAGES=50
MAX_CRAWL_DEPTH=3
```

---

## Step 9: Update Code for REDIS_URL

Railway provides Redis connection as `REDIS_URL` instead of separate host/port. Update the queue configuration:

**File: `src/config/queue.js`**

Add this at the top:
```javascript
// Parse REDIS_URL if provided (Railway uses this)
let redisConfig;
if (process.env.REDIS_URL) {
  redisConfig = {
    connection: process.env.REDIS_URL
  };
} else {
  redisConfig = {
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined
    }
  };
}

export const queueConnection = redisConfig.connection;
```

Then push changes:
```bash
git add .
git commit -m "Update Redis config for Railway deployment"
git push
```

---

## Step 10: Generate Domain & Deploy

1. Go to **seo-audit-api** service → **"Settings"** tab
2. Under **"Networking"**, click **"Generate Domain"**
3. Railway will create a URL like: `https://seo-audit-api-production.up.railway.app`
4. **Copy this URL - this is your API endpoint!**

Both services will automatically deploy when you push to GitHub.

---

## Step 11: Verify Deployment

### Test Health Endpoint
```bash
curl https://YOUR_RAILWAY_URL.railway.app/api/health
```

Expected response:
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2026-02-15T...",
    "uptime": 123
  }
}
```

### Start Your First Audit
```bash
curl -X POST https://YOUR_RAILWAY_URL.railway.app/api/audit/start \
  -H "Content-Type: application/json" \
  -d '{
    "targetUrl": "https://example.com",
    "config": {
      "maxPages": 10,
      "crawlDepth": 2
    }
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "auditId": "clxxxxx",
    "status": "PENDING",
    "estimatedTime": "3-5 minutes"
  }
}
```

### Check Audit Status
```bash
curl https://YOUR_RAILWAY_URL.railway.app/api/audit/AUDIT_ID/status
```

### Download Report (when completed)
```bash
curl https://YOUR_RAILWAY_URL.railway.app/api/report/AUDIT_ID/download?format=pdf --output report.pdf
```

---

## Monitoring & Logs

### View Logs
1. Go to Railway dashboard
2. Click on **seo-audit-api** or **seo-audit-worker**
3. Go to **"Deployments"** tab
4. Click **"View Logs"**

### Monitor Resource Usage
- Railway provides CPU, Memory, and Network usage graphs
- Check under **"Metrics"** tab in each service

---

## Cost Estimate

Railway Free Tier (Hobby Plan):
- $5/month credit included
- PostgreSQL + Redis + 2 services = ~$3-5/month
- **Should stay within free tier for moderate use**

If you exceed free tier:
- ~$0.000463 per GB-hour for compute
- ~$0.25 per GB for PostgreSQL storage
- ~$0.25 per GB for Redis storage

---

## Troubleshooting

### API not responding
1. Check logs in Railway dashboard
2. Verify DATABASE_URL and REDIS_URL are set
3. Check if migrations ran successfully

### Worker not processing jobs
1. Check worker logs
2. Verify REDIS_URL matches between API and worker
3. Restart worker service

### Database connection errors
1. Verify DATABASE_URL format is correct
2. Check PostgreSQL service is running
3. Try redeploying after fixing env vars

### Out of memory errors
1. Reduce WORKER_CONCURRENCY to 1
2. Reduce MAX_CRAWL_PAGES to 25
3. Upgrade Railway plan if needed

---

## Scaling Tips

### Performance Optimization
1. **Add more worker instances**: Duplicate worker service for parallel processing
2. **Increase concurrency**: Set `WORKER_CONCURRENCY=3` (monitor memory)
3. **Enable caching**: Results are cached in Redis for 24 hours

### Cost Optimization
1. **Limit crawl depth**: Set `MAX_CRAWL_DEPTH=2` for faster audits
2. **Reduce page limit**: Set `MAX_CRAWL_PAGES=25` for smaller sites
3. **Batch audits**: Run audits during off-peak hours

---

## Custom Domain (Optional)

1. Go to **seo-audit-api** → **"Settings"** → **"Networking"**
2. Click **"Custom Domain"**
3. Enter your domain (e.g., `api.yourdomain.com`)
4. Add CNAME record in your DNS:
   - Name: `api`
   - Value: `YOUR_RAILWAY_URL.railway.app`

Railway automatically provisions SSL certificate.

---

## Updating the App

```bash
# Make changes to code
git add .
git commit -m "Your changes"
git push

# Railway auto-deploys on every push to main branch
```

---

## Your Live API URL

Once deployed, your SEO Audit Tool will be available at:

**https://YOUR_PROJECT_NAME.up.railway.app**

Example endpoints:
- Health: `https://YOUR_URL/api/health`
- Start Audit: `POST https://YOUR_URL/api/audit/start`
- Get Status: `GET https://YOUR_URL/api/audit/:id/status`
- Download Report: `GET https://YOUR_URL/api/report/:id/download?format=pdf`

---

## Next Steps

1. **Test with your website**: Run a full audit on your own site
2. **Review the report**: Download PDF and verify accuracy
3. **Implement recommendations**: Use the generated roadmap
4. **Monitor usage**: Check Railway metrics and logs
5. **Share the URL**: Give access to your team

---

**Deployment Complete!** 🚀

Your SEO Audit Tool is now live and ready to analyze websites.
