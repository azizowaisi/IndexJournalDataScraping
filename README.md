# Index Journals Data Scraping

A serverless AWS Lambda function built with Node.js and Axios for scraping journal data from OAI (Open Archives Initiative) endpoints and storing XML files in S3.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Environment Configuration](#environment-configuration)
- [Deployment](#deployment)
- [Scripts](#scripts)
- [CI/CD Pipeline](#cicd-pipeline)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

## Overview

This service is part of a two-service architecture:
1. **IndexJournalsDataScraping** (this service) - Scrapes OAI data and stores in S3
2. **IndexJournalsDataIntegration** - Processes S3 files and saves to MySQL database

### Features

- **Modern HTTP Client**: Uses Axios for fast and reliable HTTP requests
- **OAI Pagination**: Handles large datasets with resumption tokens
- **S3 Organization**: Files stored with date-based folder structure
- **Error Handling**: Comprehensive error handling and logging
- **Scalable**: Serverless architecture with auto-scaling
- **Multi-Environment**: Support for local and production deployments

## Architecture

```
SQS Queue → Lambda Function → OAI Endpoint → S3 Storage → SQS Queue (Integration)
```

### Technology Stack

- **Node.js 22.x**: Latest LTS version
- **Axios**: Modern HTTP client for fast and reliable requests
- **AWS Lambda**: Serverless compute
- **AWS S3**: Object storage
- **AWS SQS**: Message queuing
- **npm**: Package manager and build tool
- **Serverless Framework**: Deployment automation
- **Jest**: Testing framework

## Quick Start

### 1. Prerequisites

```bash
# Install required tools
# - Node.js 22.x or later
# - npm (comes with Node.js)
# - AWS CLI
# - Serverless Framework

# Configure AWS credentials
aws configure
```

### 2. Configure Environment

Update the environment configuration files in `config/` directory:

```bash
# Update AWS credentials and Serverless access key in environment files
# Replace your-access-key-id, your-secret-access-key, and your-serverless-access-key with your actual credentials
nano config/env.local
nano config/env.prod
```

### 3. Build and Deploy

```bash
# Deploy to local development
./scripts/deploy local us-east-1

# Deploy to production
./scripts/deploy prod us-east-1
```

### 4. Verify Deployment

```bash
# Check function status
aws lambda get-function --function-name index-journals-data-scraping-local-scraping

# View logs
./scripts/logs.sh local us-east-1 recent 50
```

## Project Structure

```
IndexJournalsDataScraping/
├── config/                    # Environment configuration files
│   ├── env.local             # Local development settings
│   └── env.prod              # Production environment settings
├── scripts/                   # Deployment and build scripts
│   └── deploy                # Main deployment script
├── src/                       # Source code
│   ├── handler.js             # Main Lambda handler
│   └── processors/
│       ├── oaiDataProcessor.js    # OAI data processing with Axios
│       ├── s3FileProcessor.js     # S3 file operations
│       └── sqsMessageProcessor.js # SQS message handling
├── tests/                     # Test code (mirrors src structure)
│   ├── handler.test.js        # Main handler tests
│   └── processors/
│       ├── oaiDataProcessor.test.js    # OAI processor tests
│       ├── s3FileProcessor.test.js     # S3 processor tests
│       └── sqsMessageProcessor.test.js # SQS processor tests
├── serverless/                # Serverless build artifacts (auto-generated)
│   ├── README.md             # Build artifacts documentation
│   └── .gitkeep              # Ensures directory is tracked
├── .github/workflows/         # CI/CD pipelines
│   ├── build.yml             # Build and test workflow
│   └── ci-cd.yml             # CI/CD deployment workflow
├── package.json               # Node.js dependencies and scripts
├── serverless.yml             # Serverless Framework configuration
├── .serverlessignore          # Files to exclude from deployment
└── README.md                  # This file
```

## Build Artifacts

The `serverless/` directory contains documentation about build artifacts. The actual build artifacts are stored in `.serverless/` (auto-generated) and are excluded from version control.

### Important Files:
- `.serverless/` - Build artifacts (auto-generated, git-ignored)
- `.serverlessignore` - Controls what gets included in deployment packages
- `serverless/README.md` - Detailed documentation about build artifacts

## Environment Configuration

### Available Environments

- **local** - Uses `config/env.local` for local development
- **prod** - Uses `config/env.prod` for production deployment

### Environment File Structure

Each environment file contains configuration for:

#### AWS Configuration
```bash
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key
AWS_REGION=us-east-1

# Serverless Framework Configuration
SERVERLESS_ACCESS_KEY=your-serverless-access-key
```

#### S3 Configuration
```bash
S3_BUCKET_NAME=journal-index-scraping-local
```

#### SQS Configuration
```bash
SQS_SCRAPING_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/journal-scraping-queue-local
SQS_SCRAPING_QUEUE_ARN=arn:aws:sqs:us-east-1:123456789012:journal-scraping-queue-local
SQS_INTEGRATION_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/123456789012/journal-integration-queue-local
SQS_INTEGRATION_QUEUE_ARN=arn:aws:sqs:us-east-1:123456789012:journal-integration-queue-local
```


### Environment Differences

Both local and production environments use the same basic configuration with different resource names and regions.

## Deployment

### Prerequisites

- Java 21
- Maven 3.8+
- Node.js 22+
- AWS CLI configured
- Serverless Framework 4.x

### Build and Test

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Deploy Options

#### Option 1: Deployment Script (Recommended)
```bash
# Deploy to local development
./scripts/deploy local us-east-1

# Deploy to production
./scripts/deploy prod us-east-1
```

#### Option 2: Serverless Framework
```bash
# Set environment variables first
export S3_BUCKET_NAME=journal-index-scraping-local
export SQS_SCRAPING_QUEUE_ARN=arn:aws:sqs:us-east-1:123456789012:journal-scraping-queue-local
export SQS_INTEGRATION_QUEUE_ARN=arn:aws:sqs:us-east-1:123456789012:journal-integration-queue-local

# Deploy to local
serverless deploy --stage local

# Deploy to production
serverless deploy --stage prod
```

#### Option 3: CI/CD Pipeline
- Push to `master` → Auto-deploy to production
- Manual triggers available for any environment

### Environment Setup

The deployment process automatically handles:

1. ✅ S3 bucket creation and configuration
2. ✅ SQS queues setup with dead letter queues
3. ✅ IAM roles and permissions
4. ✅ CloudWatch monitoring and alarms
5. ✅ Environment-specific configurations

## Scripts

### Deployment Script

#### Main Deployment Script

- **`scripts/deploy`** - Main deployment script
  - Usage: `./scripts/deploy [local|prod] [region]`
  - Deploys the application to AWS with all required resources
  - Handles building, environment configuration, and deployment

### Script Usage Examples

#### Deployment
```bash
# Deploy to local development
./scripts/deploy local us-east-1

# Deploy to production
./scripts/deploy prod us-east-1

# Deploy to local with default region (us-east-1)
./scripts/deploy local
```

#### Status and Monitoring
```bash
# Check deployment status
aws lambda get-function --function-name index-journals-data-scraping-local-scraping

# View recent logs
aws logs tail /aws/lambda/index-journals-data-scraping-local-scraping --follow

# View logs with filter
aws logs filter-log-events --log-group-name /aws/lambda/index-journals-data-scraping-local-scraping --start-time $(date -d '1 hour ago' +%s)000
```

## CI/CD Pipeline

### GitHub Actions

The project includes two GitHub Actions workflows:

#### Build Workflow (`.github/workflows/build.yml`)
- Runs on all branches and pull requests
- Builds and tests the application
- Performs security scanning with Trivy
- Uploads build artifacts

#### CI/CD Workflow (`.github/workflows/ci-cd.yml`)
- Runs on push to `master` branch
- Deploys automatically to production
- Uses environment variables from GitHub Secrets
- Includes post-deployment verification

### Required GitHub Secrets

Configure the following secrets in your GitHub repository:

```
# AWS Configuration
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION
SERVERLESS_ACCESS_KEY

# S3 Configuration
S3_BUCKET_NAME

# SQS Configuration
SQS_SCRAPING_QUEUE_URL
SQS_SCRAPING_QUEUE_ARN
SQS_INTEGRATION_QUEUE_URL
SQS_INTEGRATION_QUEUE_ARN
```

## Testing

### Test Coverage

The project includes comprehensive unit tests for all Java classes:

- **`LambdaHandlerTest.java`** - Tests for the main Lambda handler
- **`OaiDataProcessorTest.java`** - Tests for OAI data processing logic
- **`S3FileProcessorTest.java`** - Tests for S3 file operations
- **`SqsMessageProcessorTest.java`** - Tests for SQS message handling

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npm test -- --testNamePattern="handler"

# Run tests with verbose output
npm test -- --verbose
```

### Test Structure

Tests use Jest for mocking AWS services:

```java
@ExtendWith(MockitoExtension.class)
class LambdaHandlerTest {
    @Mock
    private Context context;
    
    @Test
    void testHandleRequest_Success() {
        // Test implementation
    }
}
```

### CI/CD Testing

The GitHub Actions workflow automatically runs tests on every push and pull request, ensuring code quality and preventing regressions.

## Monitoring

### CloudWatch Logs
- **Log Groups**: `/aws/lambda/index-journals-data-scraping-{stage}-scraping`
- **Log Retention**: Configurable per environment (3-30 days)

### Key Metrics
- **Lambda Metrics**: Invocations, Errors, Duration, Throttles
- **SQS Metrics**: Queue depth, message age, processing rate
- **S3 Metrics**: Object count, bucket size, request metrics

### Log Commands
```bash
# View recent logs
./scripts/logs.sh local us-east-1 recent 100

# Follow logs in real-time
./scripts/logs.sh local us-east-1 follow

# Search for specific terms
./scripts/logs.sh local us-east-1 search "timeout"

# View error logs only
./scripts/logs.sh local us-east-1 errors
```

## SQS Message Format

### Input Message
```json
{
  "journalKey": "JOURNAL_001",
  "companyKey": "COMPANY_001",
  "oaiUrl": "https://example.com/oai",
  "metadataPrefix": "oai_dc"
}
```

### Output Message
```json
{
  "journalKey": "JOURNAL_001",
  "companyKey": "COMPANY_001",
  "s3Bucket": "journal-index-scraping-local",
  "s3Key": "2024/01/15/JOURNAL_001/JOURNAL_001_20240115_143022.xml",
  "s3Url": "https://journal-index-scraping-local.s3.us-east-1.amazonaws.com/2024/01/15/JOURNAL_001/JOURNAL_001_20240115_143022.xml",
  "filename": "JOURNAL_001_20240115_143022.xml",
  "fileSize": 12345,
  "messageType": "file-processing-request",
  "source": "scraping-service"
}
```

## Troubleshooting

### Common Issues

#### 1. AWS Credentials Not Configured
```bash
aws configure
```

#### 2. Environment File Not Found
```bash
# Check if environment file exists
ls config/env.local

# Available environments
ls config/env.*
```

#### 3. AWS Account ID Mismatch
```bash
# Update AWS Account ID in environment files
# Replace 123456789012 with your actual account ID
nano config/env.local
```

#### 4. Deployment Failures
```bash
# Check deployment status
./scripts/status.sh local us-east-1

# View recent logs
./scripts/logs.sh local us-east-1 recent 50

# Check for errors
./scripts/logs.sh local us-east-1 errors
```

#### 5. Function Not Found
```bash
# Verify function exists
aws lambda get-function --function-name index-journals-data-scraping-local-scraping

# List all functions
aws lambda list-functions --query 'Functions[?contains(FunctionName, `index-journals`)]'
```

### Debug Mode

Enable debug logging by setting `LOG_LEVEL=DEBUG` in your environment file.

### Health Checks

```bash
# Test Lambda function
./scripts/manage.sh test local us-east-1

# Check function status
./scripts/status.sh local us-east-1

# View function details
aws lambda get-function --function-name index-journals-data-scraping-local-scraping
```

## Security

### Best Practices
- **Least Privilege**: IAM roles with minimal required permissions
- **Encryption**: S3 server-side encryption enabled for staging/prod
- **Network**: HTTPS for all external communications
- **Monitoring**: CloudWatch logs and alarms enabled

### Environment-Specific Security
- **Local**: Minimal security for development
- **Staging**: Moderate security for testing
- **Production**: Full security with X-Ray tracing and encryption

## Performance

### Configuration by Environment

| Setting | Local | Staging | Production |
|---------|-------|---------|------------|
| Memory | 1024MB | 1024MB | 1024MB |
| Timeout | 900s | 900s | 900s |
| Batch Size | 1 | 1 | 1 |
| Concurrency | Auto | Auto | Auto |

### Optimization Tips
- Monitor CloudWatch metrics for performance insights
- Adjust batch sizes based on processing patterns
- Use appropriate log levels to minimize overhead
- Configure appropriate timeouts for OAI endpoints

## Related Services

- **IndexJournalsDataIntegration**: Processes files from this service
- **Symfony Application**: Sends initial scraping requests

## Support

For issues and questions:

1. **Check Logs**: Use `./scripts/logs.sh` to view application logs
2. **Check Status**: Use `./scripts/status.sh` to verify deployment
3. **Review Configuration**: Verify environment files in `config/` directory
4. **Monitor Resources**: Check AWS Console for resource status
5. **Contact Team**: Reach out to the development team for assistance

---

## Quick Reference

### Essential Commands
```bash
# Deploy to production
./scripts/deploy prod

# Deploy to local
./scripts/deploy local

# Run tests
npm test

# Clean build artifacts
npm run clean

# Clean everything (including node_modules)
npm run clean:all

# View logs
serverless logs -f journalDataScraping --tail

# Remove deployment
serverless remove --stage prod
```

### Environment Files
- `config/env.local` - Local development
- `config/env.prod` - Production deployment

### Key Resources
- **Lambda Function**: `index-journals-data-scraping-{stage}-scraping`
- **S3 Bucket**: `journal-index-scraping-{stage}`
- **SQS Queues**: `journal-scraping-queue-{stage}`, `journal-integration-queue-{stage}`