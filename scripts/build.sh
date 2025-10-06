#!/bin/bash

# Build script for Index Journals Data Scraping
# Usage: ./build/build.sh [stage] [region]

set -e

# Default values
STAGE=${1:-dev}
REGION=${2:-us-east-1}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Java is installed
    if ! command -v java &> /dev/null; then
        log_error "Java is not installed. Please install Java 21."
        exit 1
    fi
    
    # Check Java version
    JAVA_VERSION=$(java -version 2>&1 | awk -F '"' '/version/ {print $2}' | awk -F '.' '{print $1}')
    if [ "$JAVA_VERSION" -lt 21 ]; then
        log_error "Java 21 is required. Current version: $JAVA_VERSION"
        exit 1
    fi
    
    # Check if Maven is installed
    if ! command -v mvn &> /dev/null; then
        log_error "Maven is not installed. Please install Maven 3.8+."
        exit 1
    fi
    
    log_success "All prerequisites met"
}

# Set environment variables based on stage
set_environment_variables() {
    log_info "Setting environment variables for stage: $STAGE"
    
    case "$STAGE" in
        "dev")
            export S3_BUCKET_NAME="journal-index-scraping-dev"
            export SQS_SCRAPING_QUEUE_ARN="arn:aws:sqs:$REGION:123456789012:journal-scraping-queue-dev"
            export SQS_INTEGRATION_QUEUE_ARN="arn:aws:sqs:$REGION:123456789012:journal-integration-queue-dev"
            export LOG_LEVEL="DEBUG"
            export MAX_RETRIES="3"
            export LOG_RETENTION_DAYS="7"
            ;;
        "staging")
            export S3_BUCKET_NAME="journal-index-scraping-staging"
            export SQS_SCRAPING_QUEUE_ARN="arn:aws:sqs:$REGION:123456789012:journal-scraping-queue-staging"
            export SQS_INTEGRATION_QUEUE_ARN="arn:aws:sqs:$REGION:123456789012:journal-integration-queue-staging"
            export LOG_LEVEL="INFO"
            export MAX_RETRIES="3"
            export LOG_RETENTION_DAYS="14"
            ;;
        "prod")
            export S3_BUCKET_NAME="journal-index-scraping-prod"
            export SQS_SCRAPING_QUEUE_ARN="arn:aws:sqs:$REGION:123456789012:journal-scraping-queue-prod"
            export SQS_INTEGRATION_QUEUE_ARN="arn:aws:sqs:$REGION:123456789012:journal-integration-queue-prod"
            export LOG_LEVEL="WARN"
            export MAX_RETRIES="5"
            export LOG_RETENTION_DAYS="30"
            export ENABLE_XRAY_TRACING="true"
            export ENABLE_ENCRYPTION="true"
            ;;
        *)
            log_error "Invalid stage: $STAGE. Valid stages are: dev, staging, prod"
            exit 1
            ;;
    esac
    
    # Common environment variables
    export AWS_REGION="$REGION"
    export STAGE="$STAGE"
    export FUNCTION_TYPE="scraping"
    export BATCH_SIZE="1"
    export OAI_METADATA_PREFIX="oai_dc"
    export OAI_BATCH_SIZE="100"
    export OAI_TIMEOUT="30000"
    
    log_success "Environment variables set for $STAGE"
}

# Build the application
build_application() {
    log_info "Building application..."
    
    cd "$PROJECT_DIR"
    
    # Clean and test
    log_info "Running tests..."
    mvn clean test
    
    # Package application
    log_info "Packaging application..."
    mvn clean package -DskipTests
    
    if [ ! -f "target/index-journals-data-scraping-1.0.0.jar" ]; then
        log_error "Build failed. JAR file not found."
        exit 1
    fi
    
    log_success "Application built successfully"
}

# Deploy using Serverless Framework
deploy_with_serverless() {
    log_info "Deploying with Serverless Framework..."
    
    cd "$PROJECT_DIR"
    
    # Check if Serverless is installed
    if ! command -v serverless &> /dev/null; then
        log_error "Serverless Framework is not installed. Please install it."
        exit 1
    fi
    
    # Deploy
    serverless deploy \
        --stage "$STAGE" \
        --region "$REGION" \
        --verbose
    
    if [ $? -eq 0 ]; then
        log_success "Deployment completed successfully"
    else
        log_error "Deployment failed"
        exit 1
    fi
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    # Get function name
    FUNCTION_NAME="index-journals-data-scraping-$STAGE-scraping"
    
    # Check if function exists
    if aws lambda get-function \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION" &> /dev/null; then
        log_success "Function $FUNCTION_NAME exists and is accessible"
    else
        log_error "Function $FUNCTION_NAME not found or not accessible"
        exit 1
    fi
    
    # Get function info
    log_info "Function details:"
    aws lambda get-function \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION" \
        --query 'Configuration.{FunctionName:FunctionName,Runtime:Runtime,State:State,LastModified:LastModified}' \
        --output table
}

# Main execution
main() {
    log_info "Starting build and deployment for stage: $STAGE, region: $REGION"
    
    check_prerequisites
    set_environment_variables
    build_application
    deploy_with_serverless
    verify_deployment
    
    log_success "Build and deployment completed successfully for $STAGE environment"
}

# Run main function
main "$@"
