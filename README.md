# SEO Audit Tool

Comprehensive SEO audit tool that programmatically analyzes websites across 6 core categories and generates professional reports with actionable recommendations.

## Features

- **6 SEO Categories**: Technical SEO (25%), On-Page SEO (20%), Content Quality (20%), Authority & Backlinks (15%), Local SEO (10%), Performance (10%)
- **Automated Analysis**: Crawls websites, analyzes HTML, checks technical infrastructure
- **Scoring Engine**: Weighted scoring algorithm with issue prioritization (Critical/High/Medium/Low)
- **Professional Reports**: Generate PDF/DOCX reports with implementation roadmaps
- **Job Queue**: Background processing with BullMQ for long-running audits
- **Google PageSpeed Integration**: Performance metrics from Google PageSpeed Insights API
- **Rate Limiting**: Built-in API rate limiting for production use
- **50+ Issue Types**: Comprehensive detection across all SEO aspects

## What It Analyzes

### 1. Technical SEO (25% weight)
- ✓ XML Sitemap detection and validation
- ✓ robots.txt analysis
- ✓ SSL certificate validation
- ✓ Mobile responsiveness
- ✓ Structured data (Schema.org)
- ✓ Canonical tags

### 2. On-Page SEO (20% weight)
- ✓ Title tags (length, uniqueness, duplicates)
- ✓ Meta descriptions
- ✓ Heading structure (H1-H3)
- ✓ URL structure
- ✓ Image optimization
- ✓ Internal linking

### 3. Content Quality (20% weight)
- ✓ Content volume (word count)
- ✓ Keyword cannibalization detection
- ✓ Readability assessment
- ✓ FAQ sections
- ✓ Multimedia presence

### 4. Performance (10% weight)
- ✓ Google PageSpeed Insights scores
- ✓ Core Web Vitals (LCP, FID, CLS)
- ✓ First Contentful Paint (FCP)
- ✓ Time to Interactive (TTI)
- ✓ Performance opportunities

### 5. Authority & Backlinks (15% weight)
- ✓ Social media presence
- ✓ Trust signals (privacy policy, terms, contact)
- ✓ Contact information (NAP)
- ✓ Security indicators
- ✓ Internal link structure

### 6. Local SEO (10% weight)
- ✓ LocalBusiness schema markup
- ✓ NAP consistency
- ✓ Google Business Profile integration
- ✓ Location keywords
- ✓ Geographic targeting

## Tech Stack

- **Backend**: Node.js, Express
- **Database**: PostgreSQL with Prisma ORM
- **Queue**: BullMQ + Redis
- **Crawling**: Cheerio, Puppeteer
- **Performance**: Lighthouse, Google PageSpeed Insights API
- **Reports**: PDFKit, docx

## Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 15
- Redis >= 7
- Google PageSpeed Insights API key (free tier)

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd seo-audit-tool
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start PostgreSQL and Redis** (using Docker Compose)
   ```bash
   docker-compose up -d
   ```

5. **Run database migrations**
   ```bash
   npm run prisma:migrate
   npm run prisma:generate
   ```

6. **Start the application**
   ```bash
   # Start API server
   npm run dev

   # Start worker (in another terminal)
   npm run worker
   ```

## Usage

### Start an Audit

```bash
POST http://localhost:3000/api/audit/start
Content-Type: application/json

{
  "targetUrl": "https://example.com",
  "config": {
    "maxPages": 50,
    "crawlDepth": 3,
    "includeMobile": true
  }
}
```

### Check Audit Status

```bash
GET http://localhost:3000/api/audit/:auditId/status
```

### Get Audit Report

```bash
GET http://localhost:3000/api/audit/:auditId/report
```

### Generate Report

```bash
GET http://localhost:3000/api/report/:auditId/generate?format=pdf
# or
GET http://localhost:3000/api/report/:auditId/generate?format=docx
```

### Download Report (PDF/DOCX)

```bash
GET http://localhost:3000/api/report/:auditId/download?format=pdf
# or
GET http://localhost:3000/api/report/:auditId/download?format=docx
```

## Configuration

See `.env.example` for all configuration options.

Key environment variables:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_HOST`, `REDIS_PORT`: Redis connection
- `GOOGLE_PAGESPEED_API_KEY`: Google PageSpeed Insights API key
- `PORT`: Server port (default: 3000)

## API Documentation

Full API documentation available at `/docs/API.md`

## Development

### Run Tests
```bash
npm test                 # All tests
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
npm run test:coverage    # With coverage report
```

### Code Quality
```bash
npm run lint    # ESLint
npm run format  # Prettier
```

### Database
```bash
npm run prisma:studio   # Open Prisma Studio
npm run prisma:generate # Generate Prisma Client
npm run prisma:migrate  # Run migrations
```

## Project Structure

```
seo-audit-tool/
├── src/
│   ├── api/            # API routes
│   ├── services/       # Business logic
│   ├── workers/        # Job queue workers
│   ├── utils/          # Utilities
│   ├── config/         # Configuration
│   └── app.js          # Express app
├── prisma/             # Database schema & migrations
├── tests/              # Test files
├── docs/               # Documentation
└── docker-compose.yml  # Docker services
```

## Deployment

See `/docs/DEPLOYMENT.md` for deployment guides (Docker, PM2, etc.)

## License

MIT

## Support

For issues or questions, please open a GitHub issue.
