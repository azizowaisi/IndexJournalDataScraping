const { XmlArticleProcessor } = require('../../src/processors/xmlArticleProcessor');

describe('XmlArticleProcessor', () => {
  let processor;

  beforeEach(() => {
    processor = new XmlArticleProcessor();
  });

  describe('parseIdentifyXml', () => {
    it('should parse valid Identify XML to JSON', async () => {
      const identifyXml = `<?xml version="1.0" encoding="UTF-8"?>
        <OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
          <Identify>
            <repositoryName>Test Repository</repositoryName>
            <baseURL>https://example.com/oai</baseURL>
            <protocolVersion>2.0</protocolVersion>
            <adminEmail>admin@example.com</adminEmail>
            <earliestDatestamp>2020-01-01</earliestDatestamp>
            <deletedRecord>persistent</deletedRecord>
            <granularity>YYYY-MM-DD</granularity>
          </Identify>
        </OAI-PMH>`;

      const result = await processor.parseIdentifyXml(identifyXml, 'test-journal-key');

      expect(result).toMatchObject({
        journal_key: 'test-journal-key',
        type: 'Identify',
        repositoryName: 'Test Repository',
        baseURL: 'https://example.com/oai',
        protocolVersion: '2.0',
        adminEmail: 'admin@example.com',
        earliestDatestamp: '2020-01-01',
        deletedRecord: 'persistent',
        granularity: 'YYYY-MM-DD',
      });
      expect(result.created_at).toBeDefined();
    });

    it('should throw error for invalid Identify XML', async () => {
      const invalidXml = `<?xml version="1.0" encoding="UTF-8"?>
        <OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
          <ListRecords></ListRecords>
        </OAI-PMH>`;

      await expect(processor.parseIdentifyXml(invalidXml)).rejects.toThrow(
        'Failed to parse Identify XML'
      );
    });
  });

  describe('parseListRecordsXml', () => {
    it('should parse valid ListRecords XML with single record', async () => {
      const listRecordsXml = `<?xml version="1.0" encoding="UTF-8"?>
        <OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
          <ListRecords>
            <record>
              <header>
                <identifier>oai:example.com:article-1</identifier>
                <datestamp>2024-01-15</datestamp>
              </header>
              <metadata>
                <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/"
                           xmlns:dc="http://purl.org/dc/elements/1.1/">
                  <dc:title xml:lang="en-US">Test Article Title</dc:title>
                  <dc:creator>John Doe</dc:creator>
                  <dc:creator>Jane Smith</dc:creator>
                  <dc:subject>Computer Science</dc:subject>
                  <dc:description xml:lang="en-US">This is a test article description</dc:description>
                  <dc:publisher>Test Publisher</dc:publisher>
                  <dc:date>2024-01-15</dc:date>
                  <dc:type>article</dc:type>
                  <dc:type>publishedVersion</dc:type>
                  <dc:identifier>https://example.com/article/1</dc:identifier>
                  <dc:source>Journal Name</dc:source>
                  <dc:language>en</dc:language>
                </oai_dc:dc>
              </metadata>
            </record>
          </ListRecords>
        </OAI-PMH>`;

      const articles = await processor.parseListRecordsXml(listRecordsXml, 'test-journal-key');

      expect(articles).toHaveLength(1);
      expect(articles[0]).toMatchObject({
        journal_key: 'test-journal-key',
        type: 'ListRecords',
        title: 'Test Article Title',
        title_lang: 'en-US',
        creator: 'John Doe',
        subjects: ['Computer Science'],
        description: 'This is a test article description',
        description_lang: 'en-US',
        publisher: 'Test Publisher',
        date: '2024-01-15',
        types: ['article', 'publishedVersion'],
        identifier: 'https://example.com/article/1',
        sources: ['Journal Name'],
        language: 'en',
        datestamp: '2024-01-15',
      });
      expect(articles[0].created_at).toBeDefined();
    });

    it('should parse valid ListRecords XML with multiple records', async () => {
      const listRecordsXml = `<?xml version="1.0" encoding="UTF-8"?>
        <OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
          <ListRecords>
            <record>
              <header>
                <identifier>oai:example.com:article-1</identifier>
                <datestamp>2024-01-15</datestamp>
              </header>
              <metadata>
                <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/"
                           xmlns:dc="http://purl.org/dc/elements/1.1/">
                  <dc:title>First Article</dc:title>
                  <dc:creator>John Doe</dc:creator>
                </oai_dc:dc>
              </metadata>
            </record>
            <record>
              <header>
                <identifier>oai:example.com:article-2</identifier>
                <datestamp>2024-01-16</datestamp>
              </header>
              <metadata>
                <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/"
                           xmlns:dc="http://purl.org/dc/elements/1.1/">
                  <dc:title>Second Article</dc:title>
                  <dc:creator>Jane Smith</dc:creator>
                </oai_dc:dc>
              </metadata>
            </record>
          </ListRecords>
        </OAI-PMH>`;

      const articles = await processor.parseListRecordsXml(listRecordsXml, 'test-journal-key');

      expect(articles).toHaveLength(2);
      expect(articles[0].title).toBe('First Article');
      expect(articles[0].journal_key).toBe('test-journal-key');
      expect(articles[0].type).toBe('ListRecords');
      expect(articles[1].title).toBe('Second Article');
      expect(articles[1].journal_key).toBe('test-journal-key');
    });

    it('should return empty array for ListRecords without records', async () => {
      const listRecordsXml = `<?xml version="1.0" encoding="UTF-8"?>
        <OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
          <ListRecords>
          </ListRecords>
        </OAI-PMH>`;

      const articles = await processor.parseListRecordsXml(listRecordsXml);

      expect(articles).toHaveLength(0);
    });

    it('should throw error for invalid ListRecords XML', async () => {
      const invalidXml = `<?xml version="1.0" encoding="UTF-8"?>
        <OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
          <Identify></Identify>
        </OAI-PMH>`;

      await expect(processor.parseListRecordsXml(invalidXml)).rejects.toThrow(
        'Failed to parse ListRecords XML'
      );
    });
  });

  describe('parseIndividualRecord', () => {
    it('should parse record with all Dublin Core fields', () => {
      const record = {
        header: {
          identifier: 'oai:test:123',
          datestamp: '2024-01-15',
          setSpec: 'article',
        },
        metadata: {
          'oai_dc:dc': {
            'dc:title': { _: 'Test Title', 'xml:lang': 'en-US' },
            'dc:creator': ['Author One', 'Author Two'],
            'dc:subject': ['Subject 1', 'Subject 2'],
            'dc:description': { _: 'Test description', 'xml:lang': 'en-US' },
            'dc:publisher': 'Test Publisher',
            'dc:date': '2024-01-15',
            'dc:type': ['article', 'publishedVersion'],
            'dc:identifier': 'https://test.com/article/123',
            'dc:source': 'Test Journal',
            'dc:language': 'en',
          },
        },
      };

      const article = processor.parseIndividualRecord(record, 1, 'test-journal-key');

      expect(article).toMatchObject({
        journal_key: 'test-journal-key',
        type: 'ListRecords',
        identifier: 'https://test.com/article/123',
        datestamp: '2024-01-15',
        setSpec: 'article',
        title: 'Test Title',
        title_lang: 'en-US',
        creator: 'Author One',
        subjects: ['Subject 1', 'Subject 2'],
        description: 'Test description',
        description_lang: 'en-US',
        publisher: 'Test Publisher',
        date: '2024-01-15',
        types: ['article', 'publishedVersion'],
        sources: ['Test Journal'],
        language: 'en',
      });
      expect(article.created_at).toBeDefined();
    });

    it('should handle missing metadata gracefully', () => {
      const record = {
        header: {
          identifier: 'oai:test:123',
        },
        metadata: {},
      };

      const article = processor.parseIndividualRecord(record, 1, 'test-journal-key');

      expect(article).toMatchObject({
        journal_key: 'test-journal-key',
        type: 'ListRecords',
        identifier: 'oai:test:123',
      });
      expect(article.created_at).toBeDefined();
    });

    it('should handle parse errors gracefully', () => {
      const invalidRecord = null;

      const article = processor.parseIndividualRecord(invalidRecord, 1, 'test-journal-key');

      expect(article).toMatchObject({
        journal_key: 'test-journal-key',
        type: 'ListRecords',
        recordIndex: 1,
        status: 'parse_error',
      });
      expect(article.error).toBeDefined();
      expect(article.created_at).toBeDefined();
    });
  });

  describe('extractValue', () => {
    it('should extract string value', () => {
      expect(processor.extractValue('test value')).toBe('test value');
    });

    it('should extract value from object with underscore property', () => {
      expect(processor.extractValue({ _: 'test value' })).toBe('test value');
    });

    it('should extract first value from array', () => {
      expect(processor.extractValue(['value1', 'value2'])).toBe('value1');
    });

    it('should return null for undefined/null', () => {
      expect(processor.extractValue(null)).toBeNull();
      expect(processor.extractValue(undefined)).toBeNull();
    });

    it('should trim whitespace from values', () => {
      expect(processor.extractValue('  test value  ')).toBe('test value');
    });
  });

  describe('extractValueWithLang', () => {
    it('should extract value with language attribute', () => {
      const field = { _: 'Test Value', 'xml:lang': 'en-US' };
      expect(processor.extractValueWithLang(field)).toEqual({
        value: 'Test Value',
        lang: 'en-US',
      });
    });

    it('should extract simple string value without language', () => {
      expect(processor.extractValueWithLang('Test Value')).toEqual({
        value: 'Test Value',
        lang: null,
      });
    });

    it('should extract value from array with language', () => {
      const field = [{ _: 'Test Value', 'xml:lang': 'en-US' }];
      expect(processor.extractValueWithLang(field)).toEqual({
        value: 'Test Value',
        lang: 'en-US',
      });
    });

    it('should return null values for null/undefined', () => {
      expect(processor.extractValueWithLang(null)).toEqual({
        value: null,
        lang: null,
      });
      expect(processor.extractValueWithLang(undefined)).toEqual({
        value: null,
        lang: null,
      });
    });
  });

  describe('extractArrayValue', () => {
    it('should extract array of values', () => {
      expect(processor.extractArrayValue(['value1', 'value2'])).toEqual(['value1', 'value2']);
    });

    it('should convert single value to array', () => {
      expect(processor.extractArrayValue('single value')).toEqual(['single value']);
    });

    it('should return empty array for null/undefined', () => {
      expect(processor.extractArrayValue(null)).toEqual([]);
      expect(processor.extractArrayValue(undefined)).toEqual([]);
    });
  });

  describe('removeNullValues', () => {
    it('should remove null and undefined values', () => {
      const obj = {
        field1: 'value1',
        field2: null,
        field3: undefined,
        field4: 'value4',
      };

      const result = processor.removeNullValues(obj);

      expect(result).toEqual({
        field1: 'value1',
        field4: 'value4',
      });
    });

    it('should remove empty arrays', () => {
      const obj = {
        field1: 'value1',
        field2: [],
        field3: ['value3'],
      };

      const result = processor.removeNullValues(obj);

      expect(result).toEqual({
        field1: 'value1',
        field3: ['value3'],
      });
    });
  });

  describe('validateOaiXml', () => {
    it('should validate correct Identify XML', async () => {
      const identifyXml = `<?xml version="1.0" encoding="UTF-8"?>
        <OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
          <Identify>
            <repositoryName>Test</repositoryName>
          </Identify>
        </OAI-PMH>`;

      const result = await processor.validateOaiXml(identifyXml);

      expect(result.valid).toBe(true);
      expect(result.type).toBe('Identify');
    });

    it('should validate correct ListRecords XML', async () => {
      const listRecordsXml = `<?xml version="1.0" encoding="UTF-8"?>
        <OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/">
          <ListRecords>
            <record></record>
          </ListRecords>
        </OAI-PMH>`;

      const result = await processor.validateOaiXml(listRecordsXml);

      expect(result.valid).toBe(true);
      expect(result.type).toBe('ListRecords');
    });

    it('should return invalid for non-OAI XML', async () => {
      const invalidXml = `<?xml version="1.0" encoding="UTF-8"?>
        <root>
          <data>Test</data>
        </root>`;

      const result = await processor.validateOaiXml(invalidXml);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing OAI-PMH root element');
    });

    it('should return invalid for malformed XML', async () => {
      const malformedXml = 'This is not XML';

      const result = await processor.validateOaiXml(malformedXml);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

