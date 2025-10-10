# Index Journals Data Scraping

A serverless AWS Lambda function built with Node.js for scraping journal data from OAI-PMH (Open Archives Initiative Protocol for Metadata Harvesting) endpoints, parsing articles to structured JSON, and delivering batched messages to SQS.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Article Processing](#article-processing)
- [SQS Message Formats](#sqs-message-formats)
- [Article Data Structure](#article-data-structure)
- [Project Structure](#project-structure)
- [Environment Configuration](#environment-configuration)
- [Deployment](#deployment)
- [Testing](#testing)
- [Monitoring](#monitoring)
- [Integration Guide](#integration-guide)
- [Troubleshooting](#troubleshooting)
- [Performance](#performance)

---

## Overview

This service is part of a two-service architecture:
1. **IndexJournalsDataScraping** (this service) - Scrapes OAI-PMH data, parses articles to JSON, and sends batched messages
2. **IndexJournalsDataIntegration** - Processes batched article messages and saves to MySQL database

### Technology Stack

- **Node.js 22.x**: Latest LTS version
- **Axios**: Modern HTTP client for OAI-PMH requests
- **xml2js**: XML parsing for Dublin Core metadata extraction
- **AWS Lambda**: Serverless compute with auto-scaling
- **AWS S3**: Object storage for XML backups
- **AWS SQS**: Message queuing with batch processing
- **Serverless Framework 4.x**: Deployment automation
- **Jest**: Testing framework with 95+ tests

---

## Features

### Core Features
- ✅ **OAI-PMH Support**: Full implementation of Identify and ListRecords verbs
- ✅ **Pagination Handling**: Automatic handling of resumption tokens
- ✅ **XML to JSON Conversion**: Dublin Core metadata parsed to structured JSON
- ✅ **Article Batching**: Up to 50 articles per SQS message (98% cost reduction!)
- ✅ **S3 Backup**: Original XML files preserved for audit/debugging
- ✅ **Language Support**: Multilingual metadata with `xml:lang` attributes
- ✅ **Error Handling**: Comprehensive error tracking and reporting
- ✅ **Scalable**: Auto-scaling serverless architecture

### Advanced Features
- **Batch Processing**: 50 articles per message reduces SQS costs by 98%
- **Multi-Environment**: Separate local and production configurations
- **CI/CD Ready**: GitHub Actions workflows included
- **Comprehensive Testing**: 95 tests with 100% coverage
- **CloudWatch Integration**: Full monitoring and alarming

---

## Architecture

### Processing Flow

```
Input SQS → Lambda Handler → OAI-PMH Endpoint
                  ↓
          1. Save XML to S3
          2. Parse XML to JSON
          3. Batch Articles (50/message)
                  ↓
         Output SQS (Integration)
```

### Detailed Flow

#### Phase 1: Repository Identification
1. Receive SQS message with journal URL
2. Fetch OAI-PMH Identify response
3. Save Identify XML to S3
4. Parse Identify data to JSON
5. Send Identify message to integration queue

#### Phase 2: Article Harvesting
1. Fetch OAI-PMH ListRecords (with pagination)
2. For each page:
   - Save complete page XML to S3
   - Parse XML to extract individual articles
   - Convert Dublin Core metadata to JSON
   - Batch articles into groups of 50
   - Send batch messages to integration queue
3. Continue pagination using resumption tokens

---

## Quick Start

### 1. Prerequisites

```bash
# Required tools
- Node.js 22.x or later
- npm (comes with Node.js)
- AWS CLI configured
- Serverless Framework 4.x

# Configure AWS credentials
aws configure
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment

Update environment files in `config/` directory:

```bash
# Edit configuration
nano config/env.local   # For development
nano config/env.prod    # For production
```

### 4. Run Tests

```bash
npm test
```

### 5. Deploy

```bash
# Deploy to local/development
./scripts/deploy local

# Deploy to production
./scripts/deploy prod
```

---

## Article Processing

### How It Works

The system processes OAI-PMH data in two phases:

#### Phase 1: Identify (Repository Information)
```
Fetch Identify → Save to S3 → Parse to JSON → Send 1 message
```

#### Phase 2: ListRecords (Articles)
```
Fetch Page → Save to S3 → Parse Articles → Batch (50 each) → Send batches
```

### Example: Journal with 150 Articles

**Processing**:
- 1 Identify request
- 3 ListRecords pages (50 articles each)
- 150 total articles

**Output**:
- 4 XML files in S3 (1 Identify + 3 ListRecords)
- 4 SQS messages (1 Identify + 3 ArticleBatch messages)

**Old Approach Would Have Sent**: 151 messages (1 + 150)  
**New Approach Sends**: 4 messages (1 + 3)  
**Reduction**: 97.4% fewer messages! 💰

---

## SQS Message Formats

### Input Message (Received from Scraping Queue)

```json
{
  "journal_key": "68653804af297",
  "url": "https://example.com/oai",
  "metadata_prefix": "oai_dc"
}
```

### Output Messages (Sent to Integration Queue)

#### 1. Article Batch Message

Articles are sent in batches of up to **50 articles per message**:

```json
{
  "journalKey": "68653804af297",
  "oaiUrl": "https://pjss.bzu.edu.pk/oai/request",
  "s3Url": "https://index-journal-files.s3.ap-south-1.amazonaws.com/2025/10/10/...",
  "s3Key": "2025/10/10/68653804af297-listrecords-page-4/...",
  "s3Path": "s3://index-journal-files/2025/10/10/...",
  "s3FileName": "68653804af297-listrecords-page-4_20251010_074806.xml",
  "messageType": "ArticleBatch",
  "source": "scraping-service",
  "pageNumber": 4,
  "batchNumber": 1,
  "totalBatches": 1,
  "articlesInBatch": 50,
  "totalArticlesInPage": 50,
  "totalRecordsProcessed": 200,
  "success": true,
  "errorCode": null,
  "errorMessage": null,
  "timestamp": "2025-10-10T07:48:07.261Z",
  
  "articles": [
    {
      "journal_key": "68653804af297",
      "created_at": "2025-10-10T07:48:07.261Z",
      "type": "ListRecords",
      "title": "Developments in Teaching, Learning and Assessment Practices",
      "title_lang": "en-US",
      "creator": "Malik, Muhammad Ali",
      "subjects": ["Teaching", "Learning", "Assessment"],
      "description": "This paper addresses the issues...",
      "description_lang": "en-US",
      "publisher": "Bahauddin Zakaria University",
      "publisher_lang": "en-US",
      "date": "2009-06-30",
      "types": ["info:eu-repo/semantics/article", "publishedVersion"],
      "format": "application/pdf",
      "identifier": "https://pjss.bzu.edu.pk/index.php/pjss/article/view/6",
      "sources": ["Pakistan Journal of Social Sciences; Vol. 29 No. 1", "2708-4175"],
      "language": "eng",
      "relation": "https://pjss.bzu.edu.pk/index.php/pjss/article/view/6/6"
    },
    {
      "journal_key": "68653804af297",
      "created_at": "2025-10-10T07:48:07.262Z",
      "type": "ListRecords",
      "title": "Second Article...",
      "creator": "Smith, John",
      "date": "2009-07-15",
      "identifier": "https://..."
    }
    // ... up to 50 articles per message
  ]
}
```

#### 2. Identify Message

Repository information sent as a single message:

```json
{
  "journalKey": "68653804af297",
  "oaiUrl": "https://pjss.bzu.edu.pk/oai/request",
  "s3Url": "https://index-journal-files.s3.ap-south-1.amazonaws.com/...",
  "s3Key": "2025/10/10/68653804af297-identify/...",
  "s3Path": "s3://index-journal-files/...",
  "filename": "68653804af297-identify_20251010_074806.xml",
  "fileSize": 1234,
  "contentType": "application/xml",
  "messageType": "Identify",
  "source": "scraping-service",
  "success": true,
  "timestamp": "2025-10-10T07:48:07.261Z",
  
  "data": {
    "journal_key": "68653804af297",
    "created_at": "2025-10-10T07:48:07.261Z",
    "type": "Identify",
    "repositoryName": "Pakistan Journal of Social Sciences",
    "baseURL": "https://pjss.bzu.edu.pk/oai/request",
    "protocolVersion": "2.0",
    "adminEmail": "admin@bzu.edu.pk",
    "earliestDatestamp": "2009-01-01",
    "deletedRecord": "no",
    "granularity": "YYYY-MM-DD"
  }
}
```

#### 3. Error Message

When processing fails:

```json
{
  "journalKey": "68653804af297",
  "oaiUrl": "https://example.com/oai",
  "s3Url": null,
  "s3Key": null,
  "messageType": "ListRecords",
  "source": "scraping-service",
  "success": false,
  "errorCode": "NETWORK_ERROR",
  "errorMessage": "Failed to connect to OAI-PMH endpoint",
  "timestamp": "2025-10-10T07:48:07.261Z"
}
```

---

## Article Data Structure

Each article in the batch contains Dublin Core metadata:

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `journal_key` | string | Journal identifier |
| `created_at` | string (ISO 8601) | Timestamp when parsed |
| `type` | string | "ListRecords" for articles |

### Article-Specific Fields

| Field | Type | Optional | Description |
|-------|------|----------|-------------|
| `title` | string | No | Article title |
| `title_lang` | string | Yes | Language code (e.g., "en-US") |
| `creator` | string | Yes | First author/creator name |
| `subjects` | array[string] | Yes | Subject keywords/topics |
| `description` | string | Yes | Article abstract |
| `description_lang` | string | Yes | Description language |
| `publisher` | string | Yes | Publisher name |
| `publisher_lang` | string | Yes | Publisher language |
| `date` | string | Yes | Publication date (YYYY-MM-DD) |
| `types` | array[string] | Yes | Document types |
| `format` | string | Yes | Content format (e.g., "application/pdf") |
| `identifier` | string | Yes | Article URL or DOI |
| `sources` | array[string] | Yes | Source identifiers (journal, ISSN) |
| `language` | string | Yes | Content language code |
| `relation` | string | Yes | Related resource URL |
| `datestamp` | string | Yes | OAI-PMH datestamp |
| `setSpec` | string | Yes | OAI-PMH set specification |

### Identify-Specific Fields

| Field | Type | Description |
|-------|------|-------------|
| `repositoryName` | string | Repository name |
| `baseURL` | string | OAI-PMH base URL |
| `protocolVersion` | string | Protocol version (typically "2.0") |
| `adminEmail` | string | Administrator email |
| `earliestDatestamp` | string | Earliest record date |
| `deletedRecord` | string | Deletion policy |
| `granularity` | string | Datestamp granularity |

---

## Project Structure

```
IndexJournalsDataScraping/
├── config/                         # Environment configuration
│   ├── env.local                  # Local development settings
│   └── env.prod                   # Production settings
├── scripts/                        # Deployment scripts
│   ├── deploy                     # Main deployment script
│   ├── clean                      # Clean build artifacts
│   └── build.sh                   # Build script
├── src/                            # Source code
│   ├── handler.js                 # Main Lambda handler
│   └── processors/
│       ├── oaiDataProcessor.js    # OAI-PMH data fetching
│       ├── s3FileProcessor.js     # S3 file operations
│       ├── sqsMessageProcessor.js # SQS messaging
│       └── xmlArticleProcessor.js # XML parsing & JSON conversion
├── tests/                          # Test suite (95 tests)
│   ├── handler.test.js
│   └── processors/
│       ├── oaiDataProcessor.test.js
│       ├── s3FileProcessor.test.js
│       ├── sqsMessageProcessor.test.js
│       └── xmlArticleProcessor.test.js
├── docs/                           # Additional documentation
├── .github/workflows/              # CI/CD pipelines
│   ├── build.yml                  # Build and test
│   └── ci-cd.yml                  # Deployment
├── package.json                    # Dependencies and scripts
├── serverless.yml                  # Serverless config
└── README.md                       # This file
```

---

## Environment Configuration

### Available Environments

- **local** - Development environment (`config/env.local`)
- **prod** - Production environment (`config/env.prod`)

### Environment File Structure

```bash
# AWS Configuration
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=us-east-1
SERVERLESS_ACCESS_KEY=your-serverless-access-key

# S3 Configuration
S3_BUCKET_NAME=index-journal-files
S3_DEPLOYMENT_BUCKET=teckiz-deployment-bucket

# SQS Configuration
SQS_SCRAPING_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/xxx/journal-scraping-queue-local
SQS_SCRAPING_QUEUE_ARN=arn:aws:sqs:us-east-1:xxx:journal-scraping-queue-local
SQS_INTEGRATION_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/xxx/journal-integration-queue-local
SQS_INTEGRATION_QUEUE_ARN=arn:aws:sqs:us-east-1:xxx:journal-integration-queue-local

# Processing Configuration
OAI_METADATA_PREFIX=oai_dc
OAI_BATCH_SIZE=100
OAI_TIMEOUT=30000
MAX_RETRIES=3
LOG_LEVEL=INFO
```

---

## Deployment

### Prerequisites

- Node.js 22+ and npm
- AWS CLI configured with credentials
- Serverless Framework 4.x

### Deployment Options

#### Option 1: Using Deployment Script (Recommended)

```bash
# Deploy to local development
./scripts/deploy local

# Deploy to production
./scripts/deploy prod

# Deploy with specific region
./scripts/deploy prod us-west-2
```

The deployment script automatically:
1. ✅ Loads environment configuration
2. ✅ Checks prerequisites (Node.js, AWS CLI, Serverless)
3. ✅ Installs dependencies
4. ✅ Runs all tests
5. ✅ Prepares production dependencies
6. ✅ Deploys to AWS using Serverless Framework
7. ✅ Shows deployment summary

#### Option 2: Using npm Scripts

```bash
# Deploy to local (runs tests first)
npm run deploy:local

# Deploy to production (runs tests first)
npm run deploy:prod
```

#### Option 3: Direct Serverless Deploy

```bash
# Set environment variables first
source config/env.prod

# Deploy
serverless deploy --stage prod --region us-east-1
```

### Post-Deployment

```bash
# View deployment info
serverless info --stage prod

# View logs
npm run logs

# Remove deployment
serverless remove --stage prod
```

---

## Testing

### Test Coverage

✅ **95 tests** across 5 test suites with **100% coverage**:

- **`handler.test.js`** (13 tests) - Lambda handler integration tests
- **`oaiDataProcessor.test.js`** (21 tests) - OAI-PMH fetching logic
- **`s3FileProcessor.test.js`** (21 tests) - S3 operations
- **`sqsMessageProcessor.test.js`** (13 tests) - SQS messaging
- **`xmlArticleProcessor.test.js`** (27 tests) - XML parsing & JSON conversion

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run specific test suite
npm test -- xmlArticleProcessor

# Run in watch mode
npm run test:watch

# CI mode (used in GitHub Actions)
npm run test:ci
```

### Test Structure

```javascript
describe('XmlArticleProcessor', () => {
  it('should parse ListRecords and batch articles', async () => {
    const articles = await processor.parseListRecordsXml(xmlData, 'journal-key');
    expect(articles).toHaveLength(50);
    expect(articles[0]).toMatchObject({
      journal_key: 'journal-key',
      type: 'ListRecords',
      title: expect.any(String),
      subjects: expect.any(Array)
    });
  });
});
```

---

## Monitoring

### CloudWatch Logs

```bash
# View real-time logs
serverless logs -f journalDataScraping --tail --stage prod

# View recent logs
aws logs tail /aws/lambda/index-journals-data-scraping-prod-scraping --follow

# Filter logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/index-journals-data-scraping-prod-scraping \
  --filter-pattern "ERROR"
```

### Key Log Messages

**Successful Processing**:
```
Phase 1: Processing Identify request for journal: 68653804af297
Parsing Identify XML to JSON
Sending Identify data as JSON to integration queue
Phase 2: Processing ListRecords request for journal: 68653804af297
Parsing ListRecords XML to extract 150 individual articles
Sending 150 articles in 3 batch(es) to integration queue
Sent batch 1/3 with 50 articles
Sent batch 2/3 with 50 articles
Sent batch 3/3 with 50 articles
Successfully sent 150/150 articles in 3 batch(es) from page 1
```

### CloudWatch Metrics

Monitor these key metrics:

| Metric | What to Watch |
|--------|---------------|
| **Invocations** | Number of Lambda executions |
| **Errors** | Failed executions (should be near zero) |
| **Duration** | Processing time (typically 5-30s per journal) |
| **Throttles** | Should be zero |
| **SQS Messages Sent** | Should be ~98% lower than before batching |
| **SQS Queue Depth** | Integration queue backlog |

---

## Integration Guide

### Processing Article Batches

Update your integration service to handle batched messages:

```javascript
// Lambda handler for integration service
exports.handler = async (event) => {
  for (const record of event.Records) {
    const message = JSON.parse(record.body);
    
    if (message.messageType === 'ArticleBatch') {
      await processArticleBatch(message);
    } else if (message.messageType === 'Identify') {
      await processIdentify(message);
    }
  }
};

async function processArticleBatch(message) {
  const { articles, journalKey, pageNumber, batchNumber } = message;
  
  console.log(`Processing batch ${batchNumber}/${message.totalBatches}`);
  console.log(`Articles in batch: ${message.articlesInBatch}`);
  console.log(`Journal: ${journalKey}, Page: ${pageNumber}`);
  
  // Option 1: Batch database insert (Recommended)
  await db.articles.bulkCreate(articles);
  
  // Option 2: Process individually with error handling
  const results = { success: 0, failed: 0, errors: [] };
  
  for (const article of articles) {
    try {
      await saveArticle({
        journal_key: article.journal_key,
        title: article.title,
        creator: article.creator,
        subjects: JSON.stringify(article.subjects),
        description: article.description,
        publisher: article.publisher,
        date: article.date,
        types: JSON.stringify(article.types),
        identifier: article.identifier,
        sources: JSON.stringify(article.sources),
        language: article.language,
        created_at: article.created_at
      });
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        identifier: article.identifier,
        error: error.message
      });
    }
  }
  
  console.log(`Batch complete: ${results.success} saved, ${results.failed} failed`);
  
  if (results.failed > 0) {
    console.error('Failed articles:', results.errors);
  }
}

async function processIdentify(message) {
  const repo = message.data;
  
  await db.repositories.upsert({
    journal_key: repo.journal_key,
    repository_name: repo.repositoryName,
    base_url: repo.baseURL,
    protocol_version: repo.protocolVersion,
    admin_email: repo.adminEmail,
    earliest_datestamp: repo.earliestDatestamp
  });
  
  console.log(`Repository info saved: ${repo.repositoryName}`);
}
```

### Database Schema Example

```sql
CREATE TABLE articles (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  journal_key VARCHAR(255) NOT NULL,
  title TEXT NOT NULL,
  title_lang VARCHAR(10),
  creator VARCHAR(500),
  subjects JSON,
  description TEXT,
  description_lang VARCHAR(10),
  publisher VARCHAR(500),
  publisher_lang VARCHAR(10),
  date DATE,
  types JSON,
  format VARCHAR(100),
  identifier VARCHAR(500) UNIQUE,
  sources JSON,
  language VARCHAR(10),
  relation VARCHAR(500),
  datestamp VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_journal_key (journal_key),
  INDEX idx_identifier (identifier),
  INDEX idx_date (date)
);

CREATE TABLE repositories (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  journal_key VARCHAR(255) UNIQUE NOT NULL,
  repository_name VARCHAR(500),
  base_url VARCHAR(500),
  protocol_version VARCHAR(10),
  admin_email VARCHAR(255),
  earliest_datestamp VARCHAR(20),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## Batching Implementation

### Why Batch 50 Articles?

1. **Cost Reduction**: 98% fewer SQS messages
2. **Performance**: 50x faster SQS operations
3. **SQS Limits**: Well within 256 KB message limit
4. **Database Efficiency**: Enables batch inserts

### Cost Comparison

**Example: 1,000 journals × 1,000 articles each = 1M articles**

| Approach | Messages | Cost/Month* | Savings |
|----------|----------|-------------|---------|
| Individual (1 per article) | 1,000,000 | $0.40 | - |
| Batched (50 per message) | 20,000 | $0.008 | **98%** |

*At $0.40 per million SQS requests (AWS pricing)

### Batch Size Selection

- **50 articles** chosen based on:
  - Average article size: 2-3 KB
  - 50 articles ≈ 100-150 KB
  - SQS limit: 256 KB per message
  - Safety margin for larger articles

### Edge Cases Handled

- **0 articles**: No batches sent
- **1-50 articles**: 1 batch
- **51-100 articles**: 2 batches (50 + remaining)
- **100+ articles**: Multiple batches of 50

---

## Performance

### Configuration by Environment

| Setting | Local | Production |
|---------|-------|------------|
| Memory | 1024 MB | 1024 MB |
| Timeout | 900s (15 min) | 900s (15 min) |
| Batch Size | 50 articles | 50 articles |
| Concurrency | Auto | Auto |
| Log Retention | 7 days | 30 days |

### Performance Metrics

**Per Journal** (typical):
- Identify: ~1 second
- ListRecords (100 articles): ~5-10 seconds
- Total: ~6-11 seconds

**Improvements from Batching**:
- **SQS Calls**: 98% reduction
- **Processing Speed**: 50x faster SQS operations
- **Cost**: 98% lower SQS costs

### Optimization Tips

1. **Batch Size**: Configurable via `BATCH_SIZE` constant in handler
2. **Pagination**: Handles unlimited articles via resumption tokens
3. **Memory**: Monitor CloudWatch for memory usage patterns
4. **Timeout**: Adjust based on slowest OAI-PMH endpoints

---

## CI/CD Pipeline

### GitHub Actions Workflows

#### Build Workflow (`.github/workflows/build.yml`)
- Triggered on: All branches and pull requests
- Steps:
  1. Checkout code
  2. Setup Node.js 22
  3. Install dependencies
  4. Run linting
  5. Run tests with coverage
  6. Upload build artifacts

#### CI/CD Workflow (`.github/workflows/ci-cd.yml`)
- Triggered on: Push to `master` branch
- Steps:
  1. Build and test
  2. Deploy to production
  3. Verify deployment
  4. Post-deployment checks

### Required GitHub Secrets

```
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
SERVERLESS_ACCESS_KEY
S3_BUCKET_NAME
SQS_SCRAPING_QUEUE_URL
SQS_SCRAPING_QUEUE_ARN
SQS_INTEGRATION_QUEUE_URL
SQS_INTEGRATION_QUEUE_ARN
```

---

## Troubleshooting

### Common Issues

#### 1. AWS Credentials Not Configured
```bash
aws configure
# Or set environment variables
export AWS_ACCESS_KEY_ID=xxx
export AWS_SECRET_ACCESS_KEY=xxx
```

#### 2. Environment File Not Found
```bash
# Check available environments
ls config/env.*

# Copy template if needed
cp config/env.local config/env.prod
nano config/env.prod
```

#### 3. Tests Failing
```bash
# Clear cache and reinstall
npm run clean:all
npm install
npm test
```

#### 4. Deployment Failures
```bash
# Check Serverless status
serverless info --stage prod

# View CloudFormation stack
aws cloudformation describe-stacks \
  --stack-name index-journals-data-scraping-prod

# Check logs
aws logs tail /aws/lambda/index-journals-data-scraping-prod-scraping
```

#### 5. Maven Errors
⚠️ **This is NOT a Maven/Java project!**  
If you see Maven errors, you're running the wrong command.  
Use `npm` commands instead of `mvn`.

#### 6. SQS Message Size Errors
If articles are very large:
- Reduce `BATCH_SIZE` from 50 to 25 or 10
- Monitor CloudWatch for message size metrics

### Debug Mode

Enable detailed logging:

```bash
# In environment file
LOG_LEVEL=DEBUG

# Redeploy
./scripts/deploy local
```

---

## Scripts Reference

### npm Scripts

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:ci` | Run tests for CI (no watch) |
| `npm run lint` | Check code quality |
| `npm run lint:fix` | Auto-fix linting issues |
| `npm run format` | Format code with Prettier |
| `npm run clean` | Clean build artifacts |
| `npm run clean:all` | Clean everything including node_modules |
| `npm run deploy:local` | Test + deploy to local |
| `npm run deploy:prod` | Test + deploy to production |
| `npm run logs` | View Lambda logs |

### Deployment Scripts

| Script | Description |
|--------|-------------|
| `./scripts/deploy [stage]` | Deploy to specified stage |
| `./scripts/clean` | Clean .serverless directory |
| `./scripts/clean --all` | Clean everything |

---

## Security

### Best Practices

- ✅ **Least Privilege IAM**: Minimal required permissions only
- ✅ **S3 Encryption**: Server-side encryption for prod
- ✅ **HTTPS Only**: All OAI-PMH requests over HTTPS
- ✅ **CloudWatch Monitoring**: All actions logged
- ✅ **Environment Separation**: Isolated local and prod environments
- ✅ **No Secrets in Code**: All credentials in environment files (gitignored)

### Environment-Specific Security

- **Local**: Basic security for development
- **Production**: Full security with encryption and X-Ray tracing

---

## Article Processing Details

### Processing Flow

For a journal with 150 articles across 3 pages:

**Phase 1: Identify**
1. Fetch Identify XML → 1 HTTP request
2. Save to S3 → 1 file
3. Parse to JSON → 1 Identify object
4. Send to SQS → **1 message**

**Phase 2: ListRecords**

**Page 1 (50 articles)**:
1. Fetch ListRecords → 1 HTTP request
2. Save XML to S3 → 1 file
3. Parse XML → 50 article objects
4. Batch articles → 1 batch (50 articles)
5. Send to SQS → **1 message**

**Page 2 (50 articles)**:
1. Fetch with resumption token → 1 HTTP request
2. Save XML to S3 → 1 file
3. Parse XML → 50 article objects
4. Batch articles → 1 batch (50 articles)
5. Send to SQS → **1 message**

**Page 3 (50 articles)**:
1. Fetch with resumption token → 1 HTTP request
2. Save XML to S3 → 1 file
3. Parse XML → 50 article objects
4. Batch articles → 1 batch (50 articles)
5. Send to SQS → **1 message**

**Totals**:
- 4 HTTP requests (1 Identify + 3 ListRecords)
- 4 S3 files (1 Identify + 3 pages)
- **4 SQS messages** (1 Identify + 3 batches)
- 150 articles processed

**Previous Approach Would Have Sent**: 151 messages  
**New Approach Sends**: 4 messages  
**Reduction**: 97.4%! 🎉

### Batch Size Configuration

Change batch size by editing `src/handler.js`:

```javascript
// Current setting
const BATCH_SIZE = 50;

// For smaller batches (if needed)
const BATCH_SIZE = 25;

// For larger batches (if articles are small)
const BATCH_SIZE = 100;
```

---

## Field Mapping Reference

### Changes from XML to JSON

| XML Field (Dublin Core) | JSON Field | Type | Notes |
|------------------------|------------|------|-------|
| `dc:title` | `title` | string | First title if multiple |
| `dc:title[@xml:lang]` | `title_lang` | string | Language attribute |
| `dc:creator` | `creator` | string | **First creator only** |
| `dc:subject` | `subjects` | array | All subjects as array |
| `dc:description` | `description` | string | Article abstract |
| `dc:description[@xml:lang]` | `description_lang` | string | Language attribute |
| `dc:publisher` | `publisher` | string | Publisher name |
| `dc:publisher[@xml:lang]` | `publisher_lang` | string | Language attribute |
| `dc:date` | `date` | string | Publication date |
| `dc:type` | `types` | array | **All types as array** |
| `dc:format` | `format` | string | Content format |
| `dc:identifier` | `identifier` | string | Article URL/DOI |
| `dc:source` | `sources` | array | **All sources as array** |
| `dc:language` | `language` | string | Language code |
| `dc:relation` | `relation` | string | Related URL |

### New Fields Added

| Field | Source | Description |
|-------|--------|-------------|
| `journal_key` | Parameter | Journal identifier |
| `created_at` | Auto-generated | Parse timestamp (ISO 8601) |
| `type` | Computed | "ListRecords" or "Identify" |

---

## Related Services

### Integration Service (IndexJournalsDataIntegration)

The integration service receives messages from this service and:
1. Processes batched article messages
2. Saves articles to MySQL database
3. Handles error cases and retries
4. Tracks processing status

### Symfony Application

The Symfony app initiates the scraping process by:
1. Sending journal URLs to scraping queue
2. Monitoring processing status
3. Displaying scraped data to users

---

## Support & Maintenance

### Getting Help

1. **Check Logs**: `npm run logs` or CloudWatch console
2. **Run Tests**: `npm test` to verify functionality
3. **Check Status**: `serverless info --stage prod`
4. **Review Config**: Verify `config/env.prod` settings
5. **Monitor Metrics**: Check CloudWatch dashboard

### Common Maintenance Tasks

```bash
# Update dependencies
npm update
npm audit fix

# Redeploy after changes
npm test && ./scripts/deploy prod

# Clean and fresh deploy
npm run clean:all
npm install
npm test
./scripts/deploy prod

# View deployment details
serverless info --stage prod

# Remove deployment
serverless remove --stage prod
```

---

## Quick Reference

### Essential Commands

```bash
# Development
npm install              # Install dependencies
npm test                # Run tests
npm run lint            # Check code quality
npm run lint:fix        # Fix linting issues

# Deployment
./scripts/deploy local  # Deploy to local
./scripts/deploy prod   # Deploy to production

# Monitoring
npm run logs            # View Lambda logs
serverless info --stage prod  # View deployment info

# Cleanup
npm run clean           # Clean build artifacts
npm run clean:all       # Clean everything
serverless remove --stage prod  # Remove deployment
```

### Environment Files
- `config/env.local` - Local development
- `config/env.prod` - Production deployment

### AWS Resources Created

| Resource | Name Pattern |
|----------|-------------|
| Lambda Function | `index-journals-data-scraping-{stage}-scraping` |
| S3 Bucket | Value from `S3_BUCKET_NAME` env var |
| Scraping Queue | From `SQS_SCRAPING_QUEUE_ARN` |
| Integration Queue | From `SQS_INTEGRATION_QUEUE_ARN` |
| CloudWatch Log Group | `/aws/lambda/index-journals-data-scraping-{stage}-scraping` |
| IAM Role | Auto-generated by Serverless Framework |

---

## License

MIT License - See LICENSE file for details

## Version

**Current Version**: 1.0.2

### Changelog

**v1.0.2** (Latest)
- ✅ Implemented article batching (50 articles per message)
- ✅ Added JSON conversion for all articles
- ✅ Added language attribute support
- ✅ 98% reduction in SQS costs
- ✅ 95 tests with 100% coverage

**v1.0.1**
- Initial XML saving to S3
- Basic OAI-PMH support

---

## Technical Details

### Message Type Reference

| Message Type | Contains | Count |
|--------------|----------|-------|
| `Identify` | Repository info | 1 per journal |
| `ArticleBatch` | Up to 50 articles | Variable (depends on total articles) |
| `Error` | Error details | As needed |

### Processing Limits

- Max articles per batch: **50**
- Max OAI-PMH pages: **Unlimited** (via resumption tokens)
- Lambda timeout: **900 seconds** (15 minutes)
- Lambda memory: **1024 MB**
- SQS message size: **256 KB** (articles fit well within this)

### Error Handling

The system handles errors at multiple levels:

1. **Network Errors**: Retry with exponential backoff
2. **Parse Errors**: Individual articles marked as failed
3. **SQS Errors**: Batch failures logged and retried
4. **S3 Errors**: Backup failures don't stop processing

---

**Made with ❤️ by Teckiz**
