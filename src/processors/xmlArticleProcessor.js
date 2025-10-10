const { parseStringPromise } = require('xml2js');

/**
 * Processor for parsing OAI-PMH XML and extracting individual articles/records
 */
class XmlArticleProcessor {
  constructor() {
    this.logger = console;
  }

  /**
   * Parse OAI-PMH Identify XML and convert to JSON
   * @param {string} xmlData - The XML string
   * @param {string} journalKey - The journal identifier
   * @returns {Promise<Object>} Parsed Identify data in JSON format
   */
  async parseIdentifyXml(xmlData, journalKey = null) {
    try {
      const result = await parseStringPromise(xmlData, {
        explicitArray: false,
        ignoreAttrs: false,
        mergeAttrs: true,
      });

      if (!result?.['OAI-PMH']?.Identify) {
        throw new Error('Invalid Identify XML structure');
      }

      const identify = result['OAI-PMH'].Identify;

      const identifyData = {
        journal_key: journalKey,
        created_at: new Date().toISOString(),
        type: 'Identify',
        repositoryName: identify.repositoryName || null,
        baseURL: identify.baseURL || null,
        protocolVersion: identify.protocolVersion || null,
        adminEmail: identify.adminEmail || null,
        earliestDatestamp: identify.earliestDatestamp || null,
        deletedRecord: identify.deletedRecord || null,
        granularity: identify.granularity || null,
        compression: identify.compression || null,
        description: identify.description || null,
      };

      return this.removeNullValues(identifyData);
    } catch (error) {
      console.error('Failed to parse Identify XML:', error);
      throw new Error(`Failed to parse Identify XML: ${error.message}`);
    }
  }

  /**
   * Parse OAI-PMH ListRecords XML and extract individual article records
   * @param {string} xmlData - The XML string
   * @param {string} journalKey - The journal identifier
   * @returns {Promise<Array>} Array of article records in JSON format
   */
  async parseListRecordsXml(xmlData, journalKey = null) {
    try {
      const result = await parseStringPromise(xmlData, {
        explicitArray: false,
        ignoreAttrs: false,
        mergeAttrs: true,
      });

      if (!result?.['OAI-PMH']?.ListRecords) {
        throw new Error('Invalid ListRecords XML structure');
      }

      const listRecords = result['OAI-PMH'].ListRecords;

      // Handle both single record and multiple records
      let records = [];
      if (listRecords.record) {
        records = Array.isArray(listRecords.record) ? listRecords.record : [listRecords.record];
      }

      console.log(`Found ${records.length} records in XML`);

      // Parse each record into JSON format
      const articles = records.map((record, index) => {
        return this.parseIndividualRecord(record, index + 1, journalKey);
      });

      return articles;
    } catch (error) {
      // If error is about missing ListRecords structure, check if it's just empty
      if (error.message === 'Invalid ListRecords XML structure') {
        console.error('Failed to parse ListRecords XML:', error);
      }
      throw new Error(`Failed to parse ListRecords XML: ${error.message}`);
    }
  }

  /**
   * Parse an individual OAI-PMH record into a structured JSON article
   * @param {Object} record - The parsed record object from xml2js
   * @param {number} recordIndex - The index of this record in the page
   * @param {string} journalKey - The journal identifier
   * @returns {Object} Structured article data
   */
  parseIndividualRecord(record, recordIndex, journalKey = null) {
    try {
      const header = record.header || {};
      const metadata = record.metadata || {};
      const dc = metadata['oai_dc:dc'] || metadata.dc || {};

      // Extract Dublin Core metadata with language attributes
      const titleData = this.extractValueWithLang(dc['dc:title'] || dc.title);
      const descriptionData = this.extractValueWithLang(dc['dc:description'] || dc.description);
      const publisherData = this.extractValueWithLang(dc['dc:publisher'] || dc.publisher);

      // Build the article JSON structure
      const article = {
        journal_key: journalKey,
        created_at: new Date().toISOString(),
        type: 'ListRecords',

        // Title with language
        title: titleData.value,
        ...(titleData.lang && { title_lang: titleData.lang }),

        // Creator (first one if multiple)
        creator: this.extractValue(dc['dc:creator'] || dc.creator),

        // Subjects array
        subjects: this.extractArrayValue(dc['dc:subject'] || dc.subject),

        // Description with language
        description: descriptionData.value,
        ...(descriptionData.lang && { description_lang: descriptionData.lang }),

        // Publisher with language
        publisher: publisherData.value,
        ...(publisherData.lang && { publisher_lang: publisherData.lang }),

        // Date
        date: this.extractValue(dc['dc:date'] || dc.date),

        // Types array (dc:type can have multiple values)
        types: this.extractArrayValue(dc['dc:type'] || dc.type),

        // Format
        format: this.extractValue(dc['dc:format'] || dc.format),

        // Identifier (OAI identifier or article URL)
        identifier: this.extractValue(dc['dc:identifier'] || dc.identifier) || header.identifier,

        // Sources array (dc:source can have multiple values)
        sources: this.extractArrayValue(dc['dc:source'] || dc.source),

        // Language
        language: this.extractValue(dc['dc:language'] || dc.language),

        // Relation
        relation: this.extractValue(dc['dc:relation'] || dc.relation),

        // Additional fields (optional)
        ...(header.datestamp && { datestamp: header.datestamp }),
        ...(header.setSpec && { setSpec: header.setSpec }),
      };

      // Remove null values to keep the JSON clean
      return this.removeNullValues(article);
    } catch (error) {
      console.error(`Failed to parse record at index ${recordIndex}:`, error);
      return {
        journal_key: journalKey,
        created_at: new Date().toISOString(),
        type: 'ListRecords',
        recordIndex,
        error: error.message,
        status: 'parse_error',
      };
    }
  }

  /**
   * Extract single value from Dublin Core field (can be string or object with _)
   */
  extractValue(field) {
    if (!field) return null;

    if (typeof field === 'string') {
      return field.trim();
    }

    if (field._ && typeof field._ === 'string') {
      return field._.trim();
    }

    if (Array.isArray(field)) {
      return field.length > 0 ? this.extractValue(field[0]) : null;
    }

    return null;
  }

  /**
   * Extract value with language attribute from Dublin Core field
   * @param {*} field - The field to extract from
   * @returns {Object} Object with value and lang properties
   */
  extractValueWithLang(field) {
    if (!field) return { value: null, lang: null };

    // If it's a simple string
    if (typeof field === 'string') {
      return { value: field.trim(), lang: null };
    }

    // If it's an object with _ (value) and xml:lang attribute
    if (typeof field === 'object' && field._) {
      return {
        value: field._.trim(),
        lang: field['xml:lang'] || field.lang || null,
      };
    }

    // If it's an array, get the first element
    if (Array.isArray(field) && field.length > 0) {
      return this.extractValueWithLang(field[0]);
    }

    return { value: null, lang: null };
  }

  /**
   * Extract array values from Dublin Core field (can contain multiple values)
   */
  extractArrayValue(field) {
    if (!field) return [];

    if (Array.isArray(field)) {
      return field.map(item => this.extractValue(item)).filter(v => v !== null);
    }

    const singleValue = this.extractValue(field);
    return singleValue ? [singleValue] : [];
  }

  /**
   * Remove null values from object
   */
  removeNullValues(obj) {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined) {
        if (Array.isArray(value) && value.length === 0) {
          continue; // Skip empty arrays
        }
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  /**
   * Validate if XML contains valid OAI-PMH structure
   */
  async validateOaiXml(xmlData) {
    try {
      const result = await parseStringPromise(xmlData, {
        explicitArray: false,
        ignoreAttrs: true,
      });

      if (!result?.['OAI-PMH']) {
        return {
          valid: false,
          error: 'Missing OAI-PMH root element',
        };
      }

      return {
        valid: true,
        type: result['OAI-PMH'].Identify
          ? 'Identify'
          : result['OAI-PMH'].ListRecords
            ? 'ListRecords'
            : 'Unknown',
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message,
      };
    }
  }
}

module.exports = { XmlArticleProcessor };
