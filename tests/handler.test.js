const { handler } = require('../src/handler');

// Mock the processors
jest.mock('../src/processors/oaiDataProcessor');
jest.mock('../src/processors/s3FileProcessor');
jest.mock('../src/processors/sqsMessageProcessor');

const { OaiDataProcessor } = require('../src/processors/oaiDataProcessor');
const { S3FileProcessor } = require('../src/processors/s3FileProcessor');
const { SqsMessageProcessor } = require('../src/processors/sqsMessageProcessor');

describe('Lambda Handler', () => {
  let mockOaiProcessor;
  let mockS3Processor;
  let mockSqsProcessor;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock instances
    mockOaiProcessor = {
      processIdentify: jest.fn(),
      processListRecords: jest.fn(),
    };
    mockS3Processor = {
      createAndUploadXml: jest.fn(),
    };
    mockSqsProcessor = {
      sendMessage: jest.fn(),
    };

    // Mock constructors
    OaiDataProcessor.mockImplementation(() => mockOaiProcessor);
    S3FileProcessor.mockImplementation(() => mockS3Processor);
    SqsMessageProcessor.mockImplementation(() => mockSqsProcessor);

    // Set environment variables
    process.env.S3_BUCKET_NAME = 'test-bucket';
  });

  afterEach(() => {
    delete process.env.S3_BUCKET_NAME;
  });

  describe('handler', () => {
    it('should process single SQS message with both Identify and ListRecords phases', async () => {
      // Mock successful Identify phase
      mockOaiProcessor.processIdentify.mockResolvedValue({
        data: '<OAI-PMH><Identify><repositoryName>Test Repository</repositoryName></Identify></OAI-PMH>',
        success: true,
        errorCode: null,
        errorMessage: null,
      });

      // Mock successful ListRecords phase
      mockOaiProcessor.processListRecords.mockImplementation(
        async (url, journalKey, pageCallback) => {
          await pageCallback(
            '<OAI-PMH><ListRecords><record>test record</record></ListRecords></OAI-PMH>',
            1,
            1,
            1
          );
          return {
            pageCount: 1,
            totalRecordsProcessed: 1,
            success: true,
            errorCode: null,
            errorMessage: null,
          };
        }
      );

      // Mock S3 uploads
      mockS3Processor.createAndUploadXml
        .mockResolvedValueOnce('https://test-bucket.s3.amazonaws.com/identify-file.xml')
        .mockResolvedValueOnce('https://test-bucket.s3.amazonaws.com/listrecords-page-1.xml');

      // Mock SQS sends
      mockSqsProcessor.sendMessage.mockResolvedValue('message-id-123');

      const event = {
        Records: [
          {
            messageId: 'test-message-id',
            body: JSON.stringify({
              url: 'https://example.com/oai',
              journal_key: 'test-journal-123',
            }),
          },
        ],
      };

      const result = await handler(event);

      expect(result).toEqual({ statusCode: 200, body: 'SUCCESS' });

      // Verify Identify phase was called
      expect(mockOaiProcessor.processIdentify).toHaveBeenCalledWith(
        'https://example.com/oai',
        'test-journal-123'
      );

      // Verify ListRecords phase was called
      expect(mockOaiProcessor.processListRecords).toHaveBeenCalledWith(
        'https://example.com/oai',
        'test-journal-123',
        expect.any(Function)
      );

      // Verify S3 uploads were called (Identify + ListRecords page)
      expect(mockS3Processor.createAndUploadXml).toHaveBeenCalledTimes(2);

      // Verify SQS messages were sent (Identify + ListRecords page)
      expect(mockSqsProcessor.sendMessage).toHaveBeenCalledTimes(2);

      // Verify Identify SQS message
      expect(mockSqsProcessor.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          journalKey: 'test-journal-123',
          oaiUrl: 'https://example.com/oai',
          messageType: 'Identify',
          success: true,
        })
      );

      // Verify ListRecords SQS message
      expect(mockSqsProcessor.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          journalKey: 'test-journal-123',
          oaiUrl: 'https://example.com/oai',
          messageType: 'ListRecords',
          pageNumber: 1,
          recordsInPage: 1,
          totalRecordsProcessed: 1,
          success: true,
        })
      );
    });

    it('should handle multiple SQS messages', async () => {
      // Mock successful responses
      mockOaiProcessor.processIdentify.mockResolvedValue({
        data: '<OAI-PMH><Identify>test</Identify></OAI-PMH>',
        success: true,
        errorCode: null,
        errorMessage: null,
      });

      mockOaiProcessor.processListRecords.mockImplementation(async (url, journalKey, callback) => {
        // Simulate one page of ListRecords
        await callback('<OAI-PMH><ListRecords>test</ListRecords></OAI-PMH>', 1, 0, 0);
        return {
          pageCount: 1,
          totalRecordsProcessed: 0,
          success: true,
          errorCode: null,
          errorMessage: null,
        };
      });

      mockS3Processor.createAndUploadXml.mockResolvedValue({
        s3Url: 'https://test-bucket.s3.amazonaws.com/test.xml',
        s3Key: 'test.xml',
        s3Path: 's3://test-bucket/test.xml',
        filename: 'test.xml',
        fileSize: 100,
        contentType: 'application/xml',
      });
      mockSqsProcessor.sendMessage.mockResolvedValue('message-id');

      const event = {
        Records: [
          {
            messageId: 'message-1',
            body: JSON.stringify({
              url: 'https://example1.com/oai',
              journal_key: 'journal-1',
            }),
          },
          {
            messageId: 'message-2',
            body: JSON.stringify({
              url: 'https://example2.com/oai',
              journal_key: 'journal-2',
            }),
          },
        ],
      };

      const result = await handler(event);

      expect(result).toEqual({ statusCode: 200, body: 'SUCCESS' });
      expect(mockOaiProcessor.processIdentify).toHaveBeenCalledTimes(2);
      expect(mockOaiProcessor.processListRecords).toHaveBeenCalledTimes(2);
      expect(mockSqsProcessor.sendMessage).toHaveBeenCalledTimes(4); // 2 records × 2 messages each (1 Identify + 1 ListRecords page)
    });

    it('should handle empty records array', async () => {
      const event = { Records: [] };

      const result = await handler(event);

      expect(result).toEqual({ statusCode: 200, body: 'SUCCESS' });
      expect(mockOaiProcessor.processIdentify).not.toHaveBeenCalled();
      expect(mockOaiProcessor.processListRecords).not.toHaveBeenCalled();
    });

    it('should handle missing required fields in SQS message', async () => {
      const event = {
        Records: [
          {
            messageId: 'test-message-id',
            body: JSON.stringify({
              url: 'https://example.com/oai',
              // Missing journal_key
            }),
          },
        ],
      };

      const result = await handler(event);

      expect(result).toEqual({ statusCode: 200, body: 'SUCCESS' });
      expect(mockOaiProcessor.processIdentify).not.toHaveBeenCalled();
      expect(mockOaiProcessor.processListRecords).not.toHaveBeenCalled();
    });

    it('should handle Identify phase failure', async () => {
      // Mock Identify failure
      mockOaiProcessor.processIdentify.mockResolvedValue({
        data: null,
        success: false,
        errorCode: 'HTTP_CLIENT_ERROR_404',
        errorMessage: 'OAI endpoint not found',
      });

      // Mock ListRecords success (should still run)
      mockOaiProcessor.processListRecords.mockResolvedValue({
        pageCount: 1,
        totalRecordsProcessed: 0,
        success: true,
        errorCode: null,
        errorMessage: null,
      });

      mockSqsProcessor.sendMessage.mockResolvedValue('message-id');

      const event = {
        Records: [
          {
            messageId: 'test-message-id',
            body: JSON.stringify({
              url: 'https://example.com/oai',
              journal_key: 'test-journal-123',
            }),
          },
        ],
      };

      const result = await handler(event);

      expect(result).toEqual({ statusCode: 200, body: 'SUCCESS' });

      // Verify error message was sent for Identify phase
      expect(mockSqsProcessor.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          journalKey: 'test-journal-123',
          messageType: 'Identify',
          success: false,
          errorCode: 'HTTP_CLIENT_ERROR_404',
          errorMessage: 'OAI endpoint not found',
        })
      );

      // Verify ListRecords phase still ran
      expect(mockOaiProcessor.processListRecords).toHaveBeenCalled();
    });

    it('should handle ListRecords phase failure', async () => {
      // Mock Identify success
      mockOaiProcessor.processIdentify.mockResolvedValue({
        data: '<OAI-PMH><Identify>test</Identify></OAI-PMH>',
        success: true,
        errorCode: null,
        errorMessage: null,
      });

      // Mock ListRecords failure
      mockOaiProcessor.processListRecords.mockResolvedValue({
        pageCount: 0,
        totalRecordsProcessed: 0,
        success: false,
        errorCode: 'HTTP_SERVER_ERROR_500',
        errorMessage: 'Server error',
      });

      mockS3Processor.createAndUploadXml.mockResolvedValue(
        'https://test-bucket.s3.amazonaws.com/identify.xml'
      );
      mockSqsProcessor.sendMessage.mockResolvedValue('message-id');

      const event = {
        Records: [
          {
            messageId: 'test-message-id',
            body: JSON.stringify({
              url: 'https://example.com/oai',
              journal_key: 'test-journal-123',
            }),
          },
        ],
      };

      const result = await handler(event);

      expect(result).toEqual({ statusCode: 200, body: 'SUCCESS' });

      // Verify Identify success message
      expect(mockSqsProcessor.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: 'Identify',
          success: true,
        })
      );

      // Verify ListRecords error message
      expect(mockSqsProcessor.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: 'ListRecords',
          success: false,
          errorCode: 'HTTP_SERVER_ERROR_500',
          errorMessage: 'Server error',
        })
      );
    });

    it('should handle ListRecords with multiple pages', async () => {
      // Mock Identify success
      mockOaiProcessor.processIdentify.mockResolvedValue({
        data: '<OAI-PMH><Identify>test</Identify></OAI-PMH>',
        success: true,
        errorCode: null,
        errorMessage: null,
      });

      // Mock ListRecords with multiple pages
      mockOaiProcessor.processListRecords.mockImplementation(
        async (url, journalKey, pageCallback) => {
          // Simulate 3 pages
          await pageCallback('<page1>', 1, 10, 10);
          await pageCallback('<page2>', 2, 10, 20);
          await pageCallback('<page3>', 3, 5, 25);
          return {
            pageCount: 3,
            totalRecordsProcessed: 25,
            success: true,
            errorCode: null,
            errorMessage: null,
          };
        }
      );

      mockS3Processor.createAndUploadXml
        .mockResolvedValueOnce('https://test-bucket.s3.amazonaws.com/identify.xml')
        .mockResolvedValueOnce('https://test-bucket.s3.amazonaws.com/page1.xml')
        .mockResolvedValueOnce('https://test-bucket.s3.amazonaws.com/page2.xml')
        .mockResolvedValueOnce('https://test-bucket.s3.amazonaws.com/page3.xml');

      mockSqsProcessor.sendMessage.mockResolvedValue('message-id');

      const event = {
        Records: [
          {
            messageId: 'test-message-id',
            body: JSON.stringify({
              url: 'https://example.com/oai',
              journal_key: 'test-journal-123',
            }),
          },
        ],
      };

      const result = await handler(event);

      expect(result).toEqual({ statusCode: 200, body: 'SUCCESS' });

      // Verify S3 uploads: 1 Identify + 3 ListRecords pages = 4 total
      expect(mockS3Processor.createAndUploadXml).toHaveBeenCalledTimes(4);

      // Verify SQS messages: 1 Identify + 3 ListRecords pages = 4 total
      expect(mockSqsProcessor.sendMessage).toHaveBeenCalledTimes(4);

      // Verify page-specific messages
      expect(mockSqsProcessor.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: 'ListRecords',
          pageNumber: 1,
          recordsInPage: 10,
          totalRecordsProcessed: 10,
        })
      );
      expect(mockSqsProcessor.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: 'ListRecords',
          pageNumber: 2,
          recordsInPage: 10,
          totalRecordsProcessed: 20,
        })
      );
      expect(mockSqsProcessor.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: 'ListRecords',
          pageNumber: 3,
          recordsInPage: 5,
          totalRecordsProcessed: 25,
        })
      );
    });

    it('should handle page processing errors in ListRecords', async () => {
      // Mock Identify success
      mockOaiProcessor.processIdentify.mockResolvedValue({
        data: '<OAI-PMH><Identify>test</Identify></OAI-PMH>',
        success: true,
        errorCode: null,
        errorMessage: null,
      });

      // Mock ListRecords with page processing error
      mockOaiProcessor.processListRecords.mockImplementation(
        async (url, journalKey, pageCallback) => {
          await pageCallback('<page1>', 1, 10, 10);
          throw new Error('Page processing failed');
        }
      );

      mockS3Processor.createAndUploadXml
        .mockResolvedValueOnce('https://test-bucket.s3.amazonaws.com/identify.xml')
        .mockResolvedValueOnce('https://test-bucket.s3.amazonaws.com/page1.xml');

      mockSqsProcessor.sendMessage.mockResolvedValue('message-id');

      const event = {
        Records: [
          {
            messageId: 'test-message-id',
            body: JSON.stringify({
              url: 'https://example.com/oai',
              journal_key: 'test-journal-123',
            }),
          },
        ],
      };

      const result = await handler(event);

      expect(result).toEqual({ statusCode: 200, body: 'SUCCESS' });

      // Verify error message was sent for ListRecords phase
      expect(mockSqsProcessor.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messageType: 'ListRecords',
          success: false,
          errorCode: 'LISTRECORDS_PROCESSING_ERROR',
          errorMessage: 'Page processing failed',
        })
      );
    });

    it('should handle invalid JSON in SQS message body', async () => {
      const event = {
        Records: [
          {
            messageId: 'test-message-id',
            body: 'invalid json',
          },
        ],
      };

      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 200,
        body: 'SUCCESS',
        batchItemFailures: [{ itemIdentifier: 'test-message-id' }],
      });
    });

    it('should return batch item failures for processing errors', async () => {
      // Mock processor initialization failure
      OaiDataProcessor.mockImplementation(() => {
        throw new Error('Unexpected initialization error');
      });

      const event = {
        Records: [
          {
            messageId: 'message-1',
            body: JSON.stringify({
              url: 'https://example1.com/oai',
              journal_key: 'journal-1',
            }),
          },
          {
            messageId: 'message-2',
            body: JSON.stringify({
              url: 'https://example2.com/oai',
              journal_key: 'journal-2',
            }),
          },
        ],
      };

      const result = await handler(event);

      expect(result).toEqual({
        statusCode: 200,
        body: 'SUCCESS',
        batchItemFailures: [{ itemIdentifier: 'message-1' }, { itemIdentifier: 'message-2' }],
      });
    });
  });
});
