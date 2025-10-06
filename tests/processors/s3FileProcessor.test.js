const { S3FileProcessor } = require('../../src/processors/s3FileProcessor');

// Mock AWS SDK v3
jest.mock('@aws-sdk/client-s3');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

describe('S3FileProcessor', () => {
  let processor;
  let mockS3Client;

  beforeEach(() => {
    // Mock S3Client
    mockS3Client = {
      send: jest.fn().mockResolvedValue({}),
    };
    S3Client.mockImplementation(() => mockS3Client);
    PutObjectCommand.mockImplementation(params => params);

    // Set environment variable
    process.env.S3_BUCKET_NAME = 'test-bucket';
    process.env.AWS_REGION = 'us-east-1';

    processor = new S3FileProcessor();
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.S3_BUCKET_NAME;
    delete process.env.AWS_REGION;
  });

  describe('constructor', () => {
    it('should initialize with S3 bucket from environment', () => {
      expect(processor.bucketName).toBe('test-bucket');
      expect(mockS3Client).toBeDefined();
    });

    it('should throw error if S3_BUCKET_NAME is not set', () => {
      delete process.env.S3_BUCKET_NAME;
      expect(() => new S3FileProcessor()).toThrow(
        'S3_BUCKET_NAME environment variable is required'
      );
    });
  });

  describe('createXmlFileForRecord', () => {
    it('should create well-formed XML for individual record', () => {
      const recordXml = '<record><header><identifier>test-id</identifier></header></record>';
      const journalKey = 'test-journal';
      const oaiUrl = 'https://example.com/oai';
      const recordNumber = 1;
      const pageNumber = 1;

      const result = processor.createXmlFileForRecord(
        recordXml,
        journalKey,
        oaiUrl,
        recordNumber,
        pageNumber
      );

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result).toContain('<oai-scraping-result>');
      expect(result).toContain('<metadata>');
      expect(result).toContain(`<journalKey>${journalKey}</journalKey>`);
      expect(result).toContain(`<oaiUrl>${oaiUrl}</oaiUrl>`);
      expect(result).toContain(`<recordNumber>${recordNumber}</recordNumber>`);
      expect(result).toContain(`<pageNumber>${pageNumber}</pageNumber>`);
      expect(result).toContain('<record>');
      expect(result).toContain(
        '&lt;record&gt;&lt;header&gt;&lt;identifier&gt;test-id&lt;/identifier&gt;&lt;/header&gt;&lt;/record&gt;'
      );
      expect(result).toContain('</record>');
      expect(result).toContain('</oai-scraping-result>');
    });

    it('should handle empty record data', () => {
      const result = processor.createXmlFileForRecord(
        '',
        'test-journal',
        'https://example.com/oai',
        1,
        1
      );

      expect(result).toContain('<!-- No record data available -->');
    });

    it('should handle null/undefined values', () => {
      const result = processor.createXmlFileForRecord(null, undefined, null, 0, 0);

      expect(result).toContain('<journalKey></journalKey>');
      expect(result).toContain('<oaiUrl></oaiUrl>');
      expect(result).toContain('<recordNumber>0</recordNumber>');
      expect(result).toContain('<pageNumber>0</pageNumber>');
    });

    it('should escape XML special characters', () => {
      const recordXml = '<record><title>Test & "Special" Characters</title></record>';
      const result = processor.createXmlFileForRecord(
        recordXml,
        'test<journal>',
        'https://example.com/oai',
        1,
        1
      );

      expect(result).toContain('&amp;');
      expect(result).toContain('&quot;');
      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
    });

    it('should remove XML declaration from record data', () => {
      const recordXml = '<?xml version="1.0"?><record><test>data</test></record>';
      const result = processor.createXmlFileForRecord(
        recordXml,
        'test-journal',
        'https://example.com/oai',
        1,
        1
      );

      expect(result).not.toContain('<?xml version="1.0"?><record>');
      expect(result).toContain('&lt;test&gt;data&lt;/test&gt;');
    });
  });

  describe('generateS3KeyForRecord', () => {
    it('should generate S3 key with date-based folder structure', () => {
      const now = new Date('2024-01-15T10:30:00Z');
      jest.spyOn(global, 'Date').mockImplementation(() => now);
      jest.spyOn(now, 'getTime').mockReturnValue(1705312200000);

      const result = processor.generateS3KeyForRecord('test-journal', 5, 2);

      expect(result).toMatch(
        /^oai-data\/2024-01-15\/test-journal\/test-journal-record-5-page-2-1705312200000\.xml$/
      );
    });

    it('should generate unique keys for different records', () => {
      const key1 = processor.generateS3KeyForRecord('journal1', 1, 1);
      const key2 = processor.generateS3KeyForRecord('journal2', 1, 1);

      expect(key1).not.toBe(key2);
      expect(key1).toContain('journal1');
      expect(key2).toContain('journal2');
    });
  });

  describe('createAndUploadXmlForRecord', () => {
    it('should create XML and upload to S3 for individual record', async () => {
      const recordXml = '<record><test>data</test></record>';
      const journalKey = 'test-journal';
      const oaiUrl = 'https://example.com/oai';
      const recordNumber = 1;
      const pageNumber = 1;

      const result = await processor.createAndUploadXmlForRecord(
        recordXml,
        journalKey,
        oaiUrl,
        recordNumber,
        pageNumber
      );

      expect(result).toMatch(
        /^https:\/\/test-bucket\.s3\.us-east-1\.amazonaws\.com\/oai-data\/\d{4}-\d{2}-\d{2}\/test-journal\/test-journal-record-1-page-1-\d+\.xml$/
      );

      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
      expect(PutObjectCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          Bucket: 'test-bucket',
          Key: expect.stringMatching(/test-journal-record-1-page-1/),
          Body: expect.stringContaining('<oai-scraping-result>'),
          ContentType: 'application/xml',
          ContentEncoding: 'utf-8',
        })
      );
    });

    it('should handle S3 upload errors for individual record', async () => {
      mockS3Client.send.mockRejectedValue(new Error('S3 upload failed'));

      await expect(
        processor.createAndUploadXmlForRecord(
          '<record>test</record>',
          'test-journal',
          'https://example.com/oai',
          1,
          1
        )
      ).rejects.toThrow(
        'Failed to create and upload XML file for record 1: Failed to upload to S3: S3 upload failed'
      );
    });
  });

  describe('uploadToS3', () => {
    it('should upload content to S3 successfully', async () => {
      const key = 'test/key.xml';
      const content = '<xml>test content</xml>';

      const result = await processor.uploadToS3(key, content);

      expect(result).toBe('https://test-bucket.s3.us-east-1.amazonaws.com/test/key.xml');
      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: key,
        Body: content,
        ContentType: 'application/xml',
        ContentEncoding: 'utf-8',
      });
    });

    it('should handle S3 upload errors', async () => {
      mockS3Client.send.mockRejectedValue(new Error('Access denied'));

      await expect(processor.uploadToS3('test/key.xml', 'content')).rejects.toThrow(
        'Failed to upload to S3: Access denied'
      );
    });
  });

  describe('createXmlFile (legacy method)', () => {
    it('should create well-formed XML with metadata and OAI data', () => {
      const oaiData = '<OAI-PMH><ListRecords><record>test</record></ListRecords></OAI-PMH>';
      const journalKey = 'test-journal';
      const oaiUrl = 'https://example.com/oai';

      const result = processor.createXmlFile(oaiData, journalKey, oaiUrl);

      expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(result).toContain('<oai-scraping-result>');
      expect(result).toContain('<metadata>');
      expect(result).toContain(`<journalKey>${journalKey}</journalKey>`);
      expect(result).toContain(`<oaiUrl>${oaiUrl}</oaiUrl>`);
      expect(result).toContain('<oai-data>');
      expect(result).toContain(oaiData);
      expect(result).toContain('</oai-data>');
    });

    it('should handle empty OAI data', () => {
      const result = processor.createXmlFile('', 'test-journal', 'https://example.com/oai');

      expect(result).toContain('<!-- No OAI data available -->');
    });
  });

  describe('createAndUploadXml (legacy method)', () => {
    it('should create XML and upload to S3 successfully', async () => {
      const oaiData = '<OAI-PMH><test>data</test></OAI-PMH>';
      const journalKey = 'test-journal';
      const oaiUrl = 'https://example.com/oai';

      const result = await processor.createAndUploadXml(oaiData, journalKey, oaiUrl);

      expect(result).toMatchObject({
        s3Bucket: 'test-bucket',
        s3Key: expect.stringMatching(
          /^\d{4}\/\d{2}\/\d{2}\/test-journal\/test-journal_\d{8}_\d+\.xml$/
        ),
        s3Url: expect.stringMatching(
          /^https:\/\/test-bucket\.s3\.us-east-1\.amazonaws\.com\/\d{4}\/\d{2}\/\d{2}\/test-journal\/test-journal_\d{8}_\d+\.xml$/
        ),
        s3Path: expect.stringMatching(
          /^s3:\/\/test-bucket\/\d{4}\/\d{2}\/\d{2}\/test-journal\/test-journal_\d{8}_\d+\.xml$/
        ),
        filename: expect.stringMatching(/^test-journal_\d{8}_\d+\.xml$/),
        fileSize: expect.any(Number),
        contentType: 'application/xml',
      });
      expect(mockS3Client.send).toHaveBeenCalledTimes(1);
    });

    it('should handle errors during XML creation', async () => {
      jest.spyOn(processor, 'createXmlFile').mockImplementation(() => {
        throw new Error('XML creation failed');
      });

      await expect(
        processor.createAndUploadXml('<test>data</test>', 'test-journal', 'https://example.com/oai')
      ).rejects.toThrow('XML creation failed');
    });

    it('should handle errors during S3 upload', async () => {
      mockS3Client.send.mockRejectedValue(new Error('S3 upload failed'));

      await expect(
        processor.createAndUploadXml('<test>data</test>', 'test-journal', 'https://example.com/oai')
      ).rejects.toThrow('Failed to upload to S3: S3 upload failed');
    });
  });

  describe('escapeXml', () => {
    it('should escape XML special characters', () => {
      expect(processor.escapeXml('Test & "Special" Characters')).toBe(
        'Test &amp; &quot;Special&quot; Characters'
      );
      expect(processor.escapeXml('<tag>content</tag>')).toBe('&lt;tag&gt;content&lt;/tag&gt;');
      expect(processor.escapeXml("Single 'quote' test")).toBe('Single &#39;quote&#39; test');
    });

    it('should handle empty string', () => {
      expect(processor.escapeXml('')).toBe('');
    });

    it('should handle null/undefined', () => {
      expect(processor.escapeXml(null)).toBe('');
      expect(processor.escapeXml(undefined)).toBe('');
    });
  });
});
