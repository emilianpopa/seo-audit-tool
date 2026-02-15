# SEO Audit Tool - Deployment Guide

This guide covers deploying the SEO Audit Tool to production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Docker Deployment](#docker-deployment)
- [Traditional Deployment (PM2)](#traditional-deployment-pm2)
- [Database Setup](#database-setup)
- [Security Configuration](#security-configuration)
- [Monitoring & Logging](#monitoring--logging)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### System Requirements

- **OS**: Linux (Ubuntu 20.04+ recommended) or Windows Server
- **CPU**: 2+ cores (4+ recommended for high load)
- **RAM**: 4GB minimum (8GB+ recommended)
- **Disk**: 20GB+ free space
- **Node.js**: >= 18.0.0
- **PostgreSQL**: 14+ or 15+
- **Redis**: 6+ or 7+

### Required Services

1. **PostgreSQL Database**
   - Production-ready instance (not development)
   - Recommended: Managed service (AWS RDS, DigitalOcean, etc.)

2. **Redis Cache**
   - Production-ready instance
   - Recommended: Managed service (AWS ElastiCache, Redis Cloud, etc.)

3. **Domain & SSL**
   - Domain name for your API
   - SSL certificate (Let's Encrypt recommended)

---

## Environment Setup

### 1. Create Production Environment File

Create `.env.production` with the following:

```env
# ============================================================================
# PRODUCTION ENVIRONMENT CONFIGURATION
# ============================================================================

# Node Environment
NODE_ENV=production
PORT=3000

# ============================================================================
# DATABASE
# ============================================================================

# PostgreSQL connection string
# Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE
DATABASE_URL=postgresql://seo_user:STRONG_PASSWORD@your-db-host.com:5432/seo_audit_prod

# ============================================================================
# REDIS
# ============================================================================

REDIS_HOST=your-redis-host.com
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_TLS=true  # Enable for managed Redis services

# ============================================================================
# GOOGLE PAGESPEED INSIGHTS API
# ============================================================================

# Get API key from: https://console.cloud.google.com
GOOGLE_PAGESPEED_API_KEY=your_production_api_key_here

# ============================================================================
# SECURITY
# ============================================================================

# CORS allowed origins (comma-separated)
CORS_ORIGIN=https://your-domain.com,https://www.your-domain.com

# API Rate Limits
API_RATE_LIMIT_WINDOW_MS=900000  # 15 minutes
API_RATE_LIMIT_MAX=100           # Max requests per window
AUDIT_RATE_LIMIT_MAX=5           # Max audits per hour

# ============================================================================
# LOGGING
# ============================================================================

LOG_LEVEL=info  # error | warn | info | debug
LOG_FILE=logs/app.log

# ============================================================================
# PERFORMANCE
# ============================================================================

# Worker concurrency (number of parallel audits)
WORKER_CONCURRENCY=3

# Maximum pages to crawl per audit (safety limit)
MAX_CRAWL_PAGES=100
MAX_CRAWL_DEPTH=5

# Request timeouts (milliseconds)
CRAWLER_TIMEOUT=10000
API_TIMEOUT=30000
```

### 2. Secure the Environment File

```bash
# Set restrictive permissions
chmod 600 .env.production

# Never commit to git
echo ".env.production" >> .gitignore
```

---

## Docker Deployment

### 1. Create Production Docker Compose

**docker-compose.prod.yml:**

```yaml
version: '3.8'

services:
  # PostgreSQL Database
  postgres:
    image: postgres:15-alpine
    container_name: seo-audit-postgres
    restart: always
    environment:
      POSTGRES_DB: seo_audit_prod
      POSTGRES_USER: seo_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U seo_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  # Redis Cache
  redis:
    image: redis:7-alpine
    container_name: seo-audit-redis
    restart: always
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # API Server
  api:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: seo-audit-api
    restart: always
    env_file:
      - .env.production
    ports:
      - "3000:3000"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # Worker
  worker:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: seo-audit-worker
    restart: always
    command: node src/workers/seoAuditWorker.js
    env_file:
      - .env.production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    deploy:
      replicas: 2  # Run 2 workers for redundancy

volumes:
  postgres_data:
  redis_data:
```

### 2. Create Dockerfile

**Dockerfile:**

```dockerfile
FROM node:18-alpine

# Install dependencies for Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Set Puppeteer to use installed Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies (production only)
RUN npm ci --only=production

# Generate Prisma client
RUN npx prisma generate

# Copy application code
COPY . .

# Create reports directory
RUN mkdir -p reports && chmod 755 reports

# Expose port
EXPOSE 3000

# Start application
CMD ["node", "src/app.js"]
```

### 3. Build and Deploy

```bash
# Build containers
docker-compose -f docker-compose.prod.yml build

# Run database migrations
docker-compose -f docker-compose.prod.yml run --rm api npx prisma migrate deploy

# Start all services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Check health
curl http://localhost:3000/api/health/detailed
```

---

## Traditional Deployment (PM2)

### 1. Install Dependencies

```bash
# Clone repository
git clone https://github.com/your-org/seo-audit-tool.git
cd seo-audit-tool

# Install Node.js dependencies
npm ci --production

# Generate Prisma client
npx prisma generate
```

### 2. Run Database Migrations

```bash
# Set production environment
export NODE_ENV=production

# Run migrations
npx prisma migrate deploy
```

### 3. Install PM2

```bash
npm install -g pm2
```

### 4. Create PM2 Ecosystem File

**ecosystem.config.js:**

```javascript
module.exports = {
  apps: [
    {
      name: 'seo-audit-api',
      script: 'src/app.js',
      instances: 2,
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: 'logs/api-error.log',
      out_file: 'logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '1G'
    },
    {
      name: 'seo-audit-worker',
      script: 'src/workers/seoAuditWorker.js',
      instances: 2,
      env_production: {
        NODE_ENV: 'production'
      },
      error_file: 'logs/worker-error.log',
      out_file: 'logs/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      max_memory_restart: '1G'
    }
  ]
};
```

### 5. Start with PM2

```bash
# Start all processes
pm2 start ecosystem.config.js --env production

# Save PM2 configuration
pm2 save

# Setup PM2 to start on system boot
pm2 startup

# Monitor processes
pm2 monit

# View logs
pm2 logs

# Restart all
pm2 restart all
```

---

## Database Setup

### 1. Create Production Database

```sql
-- Connect to PostgreSQL as superuser
psql -U postgres

-- Create database and user
CREATE DATABASE seo_audit_prod;
CREATE USER seo_user WITH ENCRYPTED PASSWORD 'STRONG_PASSWORD_HERE';

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE seo_audit_prod TO seo_user;

-- Connect to database
\c seo_audit_prod

-- Grant schema privileges
GRANT ALL ON SCHEMA public TO seo_user;
```

### 2. Run Migrations

```bash
npx prisma migrate deploy
```

### 3. Verify Database

```bash
npx prisma studio --browser none
# Access at http://localhost:5555
```

---

## Security Configuration

### 1. Firewall Rules

```bash
# Allow SSH (22)
sudo ufw allow 22/tcp

# Allow HTTP (80) and HTTPS (443)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow API port (only if not using reverse proxy)
sudo ufw allow 3000/tcp

# Enable firewall
sudo ufw enable
```

### 2. SSL Certificate (Let's Encrypt)

```bash
# Install Certbot
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone -d api.your-domain.com

# Certificate files:
# /etc/letsencrypt/live/api.your-domain.com/fullchain.pem
# /etc/letsencrypt/live/api.your-domain.com/privkey.pem
```

### 3. Nginx Reverse Proxy

**/etc/nginx/sites-available/seo-audit:**

```nginx
upstream seo_audit_api {
  server localhost:3000;
  keepalive 64;
}

server {
  listen 80;
  server_name api.your-domain.com;

  # Redirect to HTTPS
  return 301 https://$server_name$request_uri;
}

server {
  listen 443 ssl http2;
  server_name api.your-domain.com;

  # SSL Configuration
  ssl_certificate /etc/letsencrypt/live/api.your-domain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.your-domain.com/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;

  # Security Headers
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-XSS-Protection "1; mode=block" always;
  add_header Strict-Transport-Security "max-age=31536000" always;

  # Proxy Settings
  location / {
    proxy_pass http://seo_audit_api;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;

    # Timeouts
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
  }

  # Client max body size
  client_max_body_size 10M;
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/seo-audit /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

---

## Monitoring & Logging

### 1. Application Logging

Logs are written to:
- `logs/api-error.log` - API errors
- `logs/api-out.log` - API standard output
- `logs/worker-error.log` - Worker errors
- `logs/worker-out.log` - Worker standard output

### 2. Log Rotation

**logrotate.conf:**

```
/path/to/seo-audit-tool/logs/*.log {
  daily
  rotate 14
  compress
  delaycompress
  notifempty
  create 0640 nodejs nodejs
  sharedscripts
  postrotate
    pm2 reloadLogs
  endscript
}
```

### 3. Health Monitoring

Use a service like UptimeRobot or StatusCake to monitor:
- `https://api.your-domain.com/api/health` - Every 5 minutes
- Alert if response is not 200 OK

### 4. Resource Monitoring

```bash
# Install monitoring tools
npm install -g pm2-logrotate

# Monitor CPU and memory
pm2 monit

# View metrics
pm2 web  # Access at http://localhost:9615
```

---

## Troubleshooting

### Database Connection Issues

```bash
# Test PostgreSQL connection
psql -h your-db-host -U seo_user -d seo_audit_prod

# Check DATABASE_URL format
echo $DATABASE_URL

# Verify Prisma connection
npx prisma db pull
```

### Redis Connection Issues

```bash
# Test Redis connection
redis-cli -h your-redis-host -p 6379 -a your-password ping

# Check Redis status
redis-cli INFO
```

### Worker Not Processing Jobs

```bash
# Check worker logs
pm2 logs seo-audit-worker

# Restart worker
pm2 restart seo-audit-worker

# Check Redis queue
redis-cli -h localhost -p 6379
KEYS *
LLEN bull:seo-audit-queue:wait
```

### High Memory Usage

```bash
# Check memory usage
pm2 monit

# Reduce worker concurrency in .env
WORKER_CONCURRENCY=2

# Restart processes
pm2 restart all
```

### SSL Certificate Renewal

```bash
# Renew certificates
sudo certbot renew

# Test renewal
sudo certbot renew --dry-run

# Auto-renewal (add to crontab)
0 0 * * * certbot renew --quiet && systemctl reload nginx
```

---

## Backup & Recovery

### Database Backup

```bash
# Create backup
pg_dump -h your-db-host -U seo_user seo_audit_prod > backup_$(date +%Y%m%d).sql

# Restore backup
psql -h your-db-host -U seo_user seo_audit_prod < backup_20260215.sql
```

### Automated Backups

```bash
# Add to crontab (daily at 2 AM)
0 2 * * * /path/to/backup-script.sh
```

---

## Performance Optimization

### 1. Database Indexes

Already configured in Prisma schema:
- User ID + Status
- Created date (descending)
- Domain
- Audit ID
- Category
- Priority

### 2. Caching Strategy

- Crawled pages: 1 hour in-memory
- PageSpeed results: 24 hours in Redis
- Reports: Generated on-demand, stored on disk

### 3. Resource Limits

```javascript
// ecosystem.config.js
max_memory_restart: '1G'  // Restart if exceeds 1GB
instances: 2              // 2 instances for load balancing
```

---

## Support & Maintenance

### Regular Maintenance Tasks

**Weekly:**
- Review error logs
- Check disk space
- Monitor API response times

**Monthly:**
- Update dependencies (`npm outdated`)
- Review and delete old audit reports
- Database vacuum (PostgreSQL)

**Quarterly:**
- Security audit
- Performance review
- Update Node.js and system packages

---

## Additional Resources

- [Prisma Production Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [PM2 Production Guide](https://pm2.keymetrics.io/docs/usage/deployment/)
- [Node.js Security Checklist](https://cheatsheetseries.owasp.org/cheatsheets/Nodejs_Security_Cheat_Sheet.html)

---

**Deployment Checklist:**

- [ ] Environment variables configured
- [ ] Database migrated
- [ ] Redis connected
- [ ] SSL certificate installed
- [ ] Nginx reverse proxy configured
- [ ] Firewall rules applied
- [ ] PM2/Docker started
- [ ] Health check passing
- [ ] Monitoring configured
- [ ] Backups scheduled
- [ ] Documentation updated

---

For issues or questions, refer to the [Setup Guide](SETUP.md) or create a GitHub issue.
