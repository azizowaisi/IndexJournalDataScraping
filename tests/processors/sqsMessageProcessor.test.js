const { SqsMessageProcessor } = require('../../src/processors/sqsMessageProcessor');

// Mock AWS SDK v3
jest.mock('@aws-sdk/client-sqs');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

describe('SqsMessageProcessor', () => {
  let processor;
  let mockSQSClient;

  beforeEach(() => {
    // Mock SQSClient
    mockSQSClient = {
      send: jest.fn().mockResolvedValue({ MessageId: 'test-message-id-123' }),
    };
    SQSClient.mockImplementation(() => mockSQSClient);
    SendMessageCommand.mockImplementation(params => params);

    // Set environment variable
    process.env.SQS_INTEGRATION_QUEUE_URL =
      'https://sqs.us-east-1.amazonaws.com/123456789012/test-integration-queue';

    processor = new SqsMessageProcessor();
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.SQS_INTEGRATION_QUEUE_URL;
  });

  describe('constructor', () => {
    it('should initialize with SQS queue URL from environment', () => {
      expect(processor.integrationQueueUrl).toBe(
        'https://sqs.us-east-1.amazonaws.com/123456789012/test-integration-queue'
      );
      expect(mockSQSClient).toBeDefined();
    });

    it('should throw error if SQS_INTEGRATION_QUEUE_URL is not set', () => {
      delete process.env.SQS_INTEGRATION_QUEUE_URL;
      expect(() => new SqsMessageProcessor()).toThrow(
        'SQS_INTEGRATION_QUEUE_URL environment variable is required'
      );
    });
  });

  describe('sendRecordMessage', () => {
    it('should send individual record message to integration queue successfully', async () => {
      const messageData = {
        journalKey: 'test-journal',
        oaiUrl: 'https://example.com/oai',
        companyKey: 'test-company',
        recordNumber: 5,
        pageNumber: 2,
        s3Bucket: 'test-bucket',
        s3Key: 'oai-data/2024-01-15/test-journal/record-5.xml',
        s3Url: 'https://test-bucket.s3.amazonaws.com/oai-data/2024-01-15/test-journal/record-5.xml',
        s3Path: 'oai-data/2024-01-15/test-journal/record-5.xml',
        filename: 'record-5.xml',
        fileSize: 1024,
        contentType: 'application/xml',
        success: true,
        errorCode: null,
        errorMessage: null,
      };

      const result = await processor.sendRecordMessage(messageData);

      expect(result).toBe('test-message-id-123');
      expect(mockSQSClient.send).toHaveBeenCalledTimes(1);
      expect(SendMessageCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/test-integration-queue',
          MessageBody: expect.stringContaining('"recordNumber":5'),
          MessageAttributes: expect.objectContaining({
            messageType: { DataType: 'String', StringValue: 'record-processing-request' },
            source: { DataType: 'String', StringValue: 'scraping-service' },
            journalKey: { DataType: 'String', StringValue: 'test-journal' },
          }),
        })
      );

      // Verify the message body contains all expected fields
      const messageBody = JSON.parse(SendMessageCommand.mock.calls[0][0].MessageBody);
      expect(messageBody).toEqual(
        expect.objectContaining({
          journalKey: 'test-journal',
          oaiUrl: 'https://example.com/oai',
          recordNumber: 5,
          pageNumber: 2,
          s3Bucket: 'test-bucket',
          s3Key: 'oai-data/2024-01-15/test-journal/record-5.xml',
          s3Url:
            'https://test-bucket.s3.amazonaws.com/oai-data/2024-01-15/test-journal/record-5.xml',
          filename: 'record-5.xml',
          fileSize: 1024,
          contentType: 'application/xml',
          messageType: 'record-processing-request',
          source: 'scraping-service',
        })
      );
    });

    it('should handle null companyKey in record message', async () => {
      const messageData = {
        journalKey: 'test-journal',
        oaiUrl: 'https://example.com/oai',
        companyKey: null,
        recordNumber: 1,
        pageNumber: 1,
        s3Bucket: 'test-bucket',
        s3Key: 'test-key.xml',
        s3Url: 'https://test-bucket.s3.amazonaws.com/test-key.xml',
        s3Path: 'test-key.xml',
        filename: 'test-key.xml',
        fileSize: 512,
        contentType: 'application/xml',
        success: true,
        errorCode: null,
        errorMessage: null,
      };

      await processor.sendRecordMessage(messageData);

      const messageBody = JSON.parse(SendMessageCommand.mock.calls[0][0].MessageBody);
      expect(messageBody.companyKey).toBeNull();
    });

    it('should use default contentType when not provided', async () => {
      const messageData = {
        journalKey: 'test-journal',
        oaiUrl: 'https://example.com/oai',
        recordNumber: 1,
        pageNumber: 1,
        s3Bucket: 'test-bucket',
        s3Key: 'test-key.xml',
        s3Url: 'https://test-bucket.s3.amazonaws.com/test-key.xml',
        s3Path: 'test-key.xml',
        filename: 'test-key.xml',
        fileSize: 512,
        success: true,
        errorCode: null,
        errorMessage: null,
      };

      await processor.sendRecordMessage(messageData);

      const messageBody = JSON.parse(SendMessageCommand.mock.calls[0][0].MessageBody);
      expect(messageBody.contentType).toBe('application/xml');
    });

    it('should include timestamp in record message', async () => {
      const messageData = {
        journalKey: 'test-journal',
        oaiUrl: 'https://example.com/oai',
        recordNumber: 1,
        pageNumber: 1,
        s3Bucket: 'test-bucket',
        s3Key: 'test-key.xml',
        s3Url: 'https://test-bucket.s3.amazonaws.com/test-key.xml',
        s3Path: 'test-key.xml',
        filename: 'test-key.xml',
        fileSize: 512,
        success: true,
        errorCode: null,
        errorMessage: null,
      };

      await processor.sendRecordMessage(messageData);

      const messageBody = JSON.parse(SendMessageCommand.mock.calls[0][0].MessageBody);
      expect(messageBody.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should handle SQS send errors for record message', async () => {
      mockSQSClient.send.mockRejectedValue(new Error('SQS send failed'));

      const messageData = {
        journalKey: 'test-journal',
        oaiUrl: 'https://example.com/oai',
        recordNumber: 1,
        pageNumber: 1,
        s3Bucket: 'test-bucket',
        s3Key: 'test-key.xml',
        s3Url: 'https://test-bucket.s3.amazonaws.com/test-key.xml',
        s3Path: 'test-key.xml',
        filename: 'test-key.xml',
        fileSize: 512,
        success: true,
        errorCode: null,
        errorMessage: null,
      };

      await expect(processor.sendRecordMessage(messageData)).rejects.toThrow(
        'Failed to send record message to SQS: SQS send failed'
      );
    });
  });

  describe('sendMessageToQueue', () => {
    it('should send message with correct parameters', async () => {
      const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue';
      const messageData = {
        journalKey: 'test-journal',
        messageType: 'test-message',
        source: 'test-source',
      };

      const result = await processor.sendMessageToQueue(queueUrl, messageData);

      expect(result).toBe('test-message-id-123');
      expect(mockSQSClient.send).toHaveBeenCalledTimes(1);
      expect(SendMessageCommand).toHaveBeenCalledWith({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(messageData),
        MessageAttributes: {
          messageType: {
            DataType: 'String',
            StringValue: 'test-message',
          },
          source: {
            DataType: 'String',
            StringValue: 'test-source',
          },
          journalKey: {
            DataType: 'String',
            StringValue: 'test-journal',
          },
        },
      });
    });

    it('should handle missing messageType and source', async () => {
      const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue';
      const messageData = {
        journalKey: 'test-journal',
      };

      await processor.sendMessageToQueue(queueUrl, messageData);

      expect(SendMessageCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          MessageAttributes: expect.objectContaining({
            messageType: {
              DataType: 'String',
              StringValue: 'file-processing-request',
            },
            source: {
              DataType: 'String',
              StringValue: 'scraping-service',
            },
          }),
        })
      );
    });

    it('should handle SQS errors', async () => {
      mockSQSClient.send.mockRejectedValue(new Error('SQS error'));

      const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789012/test-queue';
      const messageData = { journalKey: 'test-journal' };

      await expect(processor.sendMessageToQueue(queueUrl, messageData)).rejects.toThrow(
        'Failed to send message to SQS: SQS error'
      );
    });
  });

  describe('sendMessage (legacy method)', () => {
    it('should send message to integration queue successfully', async () => {
      const messageData = {
        journalKey: 'test-journal',
        oaiUrl: 'https://example.com/oai',
        s3Url: 'https://test-bucket.s3.amazonaws.com/test-file.xml',
        s3Key: 'test-file.xml',
        messageType: 'journal-data',
        source: 'scraping-service',
        success: true,
        errorCode: null,
        errorMessage: null,
        timestamp: '2024-01-15T10:30:00Z',
      };

      const result = await processor.sendMessage(messageData);

      expect(result).toBe('test-message-id-123');
      expect(mockSQSClient.send).toHaveBeenCalledTimes(1);

      const messageBody = JSON.parse(SendMessageCommand.mock.calls[0][0].MessageBody);
      expect(messageBody).toEqual(
        expect.objectContaining({
          journalKey: 'test-journal',
          oaiUrl: 'https://example.com/oai',
          s3Url: 'https://test-bucket.s3.amazonaws.com/test-file.xml',
          s3Key: 'test-file.xml',
          messageType: 'journal-data',
          source: 'scraping-service',
          success: true,
        })
      );
    });

    it('should handle null companyKey in legacy message', async () => {
      const messageData = {
        journalKey: 'test-journal',
        oaiUrl: 'https://example.com/oai',
        companyKey: null,
        s3Url: 'https://test-bucket.s3.amazonaws.com/test-file.xml',
        s3Key: 'test-file.xml',
        messageType: 'journal-data',
        source: 'scraping-service',
      };

      await processor.sendMessage(messageData);

      const messageBody = JSON.parse(SendMessageCommand.mock.calls[0][0].MessageBody);
      expect(messageBody.companyKey).toBeNull();
    });

    it('should use default contentType when not provided', async () => {
      const messageData = {
        journalKey: 'test-journal',
        oaiUrl: 'https://example.com/oai',
        s3Url: 'https://test-bucket.s3.amazonaws.com/test-file.xml',
        s3Key: 'test-file.xml',
        messageType: 'journal-data',
        source: 'scraping-service',
      };

      await processor.sendMessage(messageData);

      const messageBody = JSON.parse(SendMessageCommand.mock.calls[0][0].MessageBody);
      expect(messageBody.contentType).toBe('application/xml');
    });

    it('should include timestamp in message', async () => {
      const messageData = {
        journalKey: 'test-journal',
        oaiUrl: 'https://example.com/oai',
        s3Url: 'https://test-bucket.s3.amazonaws.com/test-file.xml',
        s3Key: 'test-file.xml',
        messageType: 'journal-data',
        source: 'scraping-service',
      };

      await processor.sendMessage(messageData);

      const messageBody = JSON.parse(SendMessageCommand.mock.calls[0][0].MessageBody);
      expect(messageBody.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should handle SQS send errors', async () => {
      mockSQSClient.send.mockRejectedValue(new Error('SQS send failed'));

      const messageData = {
        journalKey: 'test-journal',
        oaiUrl: 'https://example.com/oai',
        s3Url: 'https://test-bucket.s3.amazonaws.com/test-file.xml',
        s3Key: 'test-file.xml',
        messageType: 'journal-data',
        source: 'scraping-service',
      };

      await expect(processor.sendMessage(messageData)).rejects.toThrow(
        'Failed to send message to SQS: SQS send failed'
      );
    });
  });
});
