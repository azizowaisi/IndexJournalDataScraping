const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

/**
 * Processor for handling S3 file operations
 */
class S3FileProcessor {
  constructor() {
    this.s3Client = new S3Client();
    this.bucketName = process.env.S3_BUCKET_NAME;

    if (!this.bucketName) {
      throw new Error('S3_BUCKET_NAME environment variable is required');
    }
  }

  /**
   * Create XML file with metadata and upload to S3
   */
  async createAndUploadXml(oaiData, journalKey, oaiUrl) {
    console.log('Processing S3 upload for journal:', journalKey);

    try {
      // Generate S3 key
      const s3Key = this.generateS3Key(journalKey);

      // Create proper XML file with metadata
      const xmlContent = this.createXmlFile(oaiData, journalKey, oaiUrl);

      // Upload XML to S3
      const s3Url = await this.uploadToS3(s3Key, xmlContent);

      console.log('Successfully uploaded XML file to S3:', s3Url);
      console.log(`S3 Path: s3://${this.bucketName}/${s3Key}`);

      return {
        s3Bucket: this.bucketName,
        s3Key,
        s3Url,
        s3Path: `s3://${this.bucketName}/${s3Key}`,
        filename: s3Key.substring(s3Key.lastIndexOf('/') + 1),
        fileSize: Buffer.byteLength(xmlContent, 'utf8'),
        contentType: 'application/xml',
      };
    } catch (error) {
      console.error('Failed to process S3 upload for journal:', journalKey, error);
      throw error;
    }
  }

  /**
   * Generate S3 key with date-based folder structure
   */
  generateS3Key(journalKey) {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const dateFolder = `${year}/${month}/${day}`;
    const timestamp = `${year}${month}${day}_${hours}${minutes}${seconds}`;
    const filename = `${journalKey}_${timestamp}.xml`;

    return `${dateFolder}/${journalKey}/${filename}`;
  }

  /**
   * Create proper XML file with OAI data and metadata
   */
  createXmlFile(oaiData, journalKey, oaiUrl) {
    try {
      // Create a well-formed XML document with metadata
      let xmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xmlContent += '<oai-scraping-result>\n';

      // Metadata section
      xmlContent += '  <metadata>\n';
      xmlContent += `    <journalKey>${this.escapeXml(journalKey || '')}</journalKey>\n`;
      xmlContent += `    <oaiUrl>${this.escapeXml(oaiUrl || '')}</oaiUrl>\n`;
      xmlContent += `    <scrapedAt>${new Date().toISOString()}</scrapedAt>\n`;
      xmlContent += '    <source>index-journals-data-scraping</source>\n';
      xmlContent += '  </metadata>\n';

      // OAI Data section
      xmlContent += '  <oai-data>\n';

      // Clean and format the OAI data
      if (oaiData && oaiData.trim().length > 0) {
        // Remove XML declaration from OAI data if present
        const cleanOaiData = oaiData.replace(/^<\?xml[^>]*\?>\s*/g, '');

        // Indent the OAI data properly
        const indentedOaiData = cleanOaiData.replace(/\n/g, '\n    ');
        xmlContent += `    ${indentedOaiData}\n`;
      } else {
        xmlContent += '    <!-- No OAI data available -->\n';
      }

      xmlContent += '  </oai-data>\n';
      xmlContent += '</oai-scraping-result>\n';

      console.log('Created XML file with', xmlContent.length, 'characters');

      return xmlContent;
    } catch (error) {
      console.error('Failed to create XML file for journal:', journalKey, error);
      throw new Error(`Failed to create XML file: ${error.message}`);
    }
  }

  /**
   * Create XML file for a single record
   */
  createXmlFileForRecord(recordXml, journalKey, oaiUrl, recordNumber, pageNumber) {
    try {
      let xmlContent = '';

      // XML Declaration
      xmlContent += '<?xml version="1.0" encoding="UTF-8"?>\n';

      // Root element
      xmlContent += '<oai-scraping-result>\n';

      // Metadata section
      xmlContent += '  <metadata>\n';
      xmlContent += `    <journalKey>${this.escapeXml(journalKey || '')}</journalKey>\n`;
      xmlContent += `    <oaiUrl>${this.escapeXml(oaiUrl || '')}</oaiUrl>\n`;
      xmlContent += `    <recordNumber>${recordNumber}</recordNumber>\n`;
      xmlContent += `    <pageNumber>${pageNumber}</pageNumber>\n`;
      xmlContent += `    <scrapedAt>${new Date().toISOString()}</scrapedAt>\n`;
      xmlContent += '    <source>index-journals-data-scraping</source>\n';
      xmlContent += '  </metadata>\n';

      // Single Record section
      xmlContent += '  <record>\n';

      // Clean and format the record data
      if (recordXml && recordXml.trim().length > 0) {
        // Remove XML declaration from record data if present
        const cleanRecordXml = recordXml.replace(/^<\?xml[^>]*\?>\s*/g, '');

        // Indent the record data properly
        const indentedRecordXml = cleanRecordXml.replace(/\n/g, '\n    ');
        xmlContent += `    ${indentedRecordXml}\n`;
      } else {
        xmlContent += '    <!-- No record data available -->\n';
      }

      xmlContent += '  </record>\n';
      xmlContent += '</oai-scraping-result>\n';

      console.log(
        `Created XML file for record ${recordNumber} with ${xmlContent.length} characters`
      );

      return xmlContent;
    } catch (error) {
      console.error(
        `Failed to create XML file for record ${recordNumber} of journal:`,
        journalKey,
        error
      );
      throw new Error(`Failed to create XML file for record ${recordNumber}: ${error.message}`);
    }
  }

  /**
   * Generate S3 key for individual record
   */
  generateS3KeyForRecord(journalKey, recordNumber, pageNumber) {
    const now = new Date();
    const dateFolder = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    const timestamp = now.getTime();
    const filename = `${journalKey}-record-${recordNumber}-page-${pageNumber}-${timestamp}.xml`;
    return `oai-data/${dateFolder}/${journalKey}/${filename}`;
  }

  /**
   * Create XML file and upload to S3 for a single record
   */
  async createAndUploadXmlForRecord(recordXml, journalKey, oaiUrl, recordNumber, pageNumber) {
    try {
      const xmlContent = this.createXmlFileForRecord(
        recordXml,
        journalKey,
        oaiUrl,
        recordNumber,
        pageNumber
      );
      const s3Key = this.generateS3KeyForRecord(journalKey, recordNumber, pageNumber);
      const s3Url = await this.uploadToS3(s3Key, xmlContent);

      console.log(
        `Successfully created and uploaded XML file for record ${recordNumber} to S3: ${s3Url}`
      );
      return s3Url;
    } catch (error) {
      console.error(
        `Failed to create and upload XML file for record ${recordNumber} of journal: ${journalKey}`,
        error
      );
      throw new Error(
        `Failed to create and upload XML file for record ${recordNumber}: ${error.message}`
      );
    }
  }

  /**
   * Upload content to S3
   */
  async uploadToS3(key, content) {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: content,
        ContentType: 'application/xml',
        ContentEncoding: 'utf-8',
      });

      await this.s3Client.send(command);
      return `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    } catch (error) {
      console.error('Failed to upload to S3:', `${this.bucketName}/${key}`, error);
      throw new Error(`Failed to upload to S3: ${error.message}`);
    }
  }

  /**
   * Escape XML special characters
   */
  escapeXml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

module.exports = { S3FileProcessor };
