// Jest setup file for global test configuration

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  // Uncomment to suppress console logs during tests
  // log: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Set test timeout
jest.setTimeout(30000);

// Mock environment variables
process.env.AWS_REGION = 'us-east-1';
process.env.S3_BUCKET_NAME = 'test-bucket';
process.env.SQS_SCRAPING_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/test-scraping-queue';
process.env.SQS_INTEGRATION_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/test-integration-queue';
