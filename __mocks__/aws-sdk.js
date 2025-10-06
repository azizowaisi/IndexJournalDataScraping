// Mock AWS SDK v3 for testing

const mockS3Client = {
  send: jest.fn(() => Promise.resolve({
    // AWS SDK v3 S3 PutObjectCommand response doesn't include Location
    // We'll construct the URL in the processor
  }))
};

const mockSQSClient = {
  send: jest.fn(() => Promise.resolve({
    MessageId: 'test-message-id-123'
  }))
};

// Mock AWS SDK v3 clients
export default {
  '@aws-sdk/client-s3': {
    S3Client: jest.fn(() => mockS3Client),
    PutObjectCommand: jest.fn()
  },
  '@aws-sdk/client-sqs': {
    SQSClient: jest.fn(() => mockSQSClient),
    SendMessageCommand: jest.fn()
  }
};
