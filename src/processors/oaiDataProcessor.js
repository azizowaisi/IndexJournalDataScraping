const axios = require('axios');
const { parseStringPromise } = require('xml2js');

class OaiDataProcessor {
  constructor() {
    this.logger = console; // Using console for logging in Lambda
    this.maxPages = 1000; // Maximum number of pages to fetch to prevent infinite loops

    // Axios configuration
    this.axiosConfig = {
      timeout: 120000, // 120 seconds
      headers: {
        'User-Agent': 'IndexJournalsDataScraping/1.0',
        Accept: '*/*',
      },
      maxRedirects: 5,
      validateStatus: status => status < 500, // Don't throw on 4xx errors
    };
  }

  /**
   * Phase 1: Process Identify request
   * @param {string} oaiUrl - The OAI endpoint URL
   * @param {string} journalKey - The journal identifier
   * @returns {Promise<Object>} Processing result
   */
  async processIdentify(oaiUrl, journalKey) {
    console.log(
      `Phase 1: Processing Identify request for journal: ${journalKey} from URL: ${oaiUrl}`
    );

    try {
      // Validate OAI URL
      this.validateOaiUrl(oaiUrl);

      // Build Identify URL
      const identifyUrl = this.buildIdentifyUrl(oaiUrl);
      console.log('Making Identify request to:', identifyUrl);

      // Make HTTP request
      const response = await axios.get(identifyUrl, this.axiosConfig);

      if (response.status !== 200) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      if (!response.data) {
        throw new Error('Empty response received from OAI endpoint');
      }

      console.log(
        `Successfully received Identify response with ${response.data.length} characters`
      );

      return {
        data: response.data,
        type: 'Identify',
        success: true,
        status: 'completed',
        errorCode: null,
        errorMessage: null,
        url: identifyUrl,
      };
    } catch (error) {
      console.error(`Failed to process Identify request for URL: ${oaiUrl}`, error);

      return {
        data: null,
        type: 'Identify',
        success: false,
        status: 'failed',
        errorCode: this.getErrorCode(error),
        errorMessage: error.message,
        url: oaiUrl,
      };
    }
  }

  /**
   * Phase 2: Process ListRecords request with pagination
   * @param {string} oaiUrl - The OAI endpoint URL
   * @param {string} journalKey - The journal identifier
   * @param {function} pageCallback - Callback function called for each page
   * @returns {Promise<Object>} Processing result
   */
  async processListRecords(oaiUrl, journalKey, pageCallback) {
    console.log(
      `Phase 2: Processing ListRecords request for journal: ${journalKey} from URL: ${oaiUrl}`
    );

    try {
      // Validate OAI URL
      this.validateOaiUrl(oaiUrl);

      let resumptionToken = null;
      let pageCount = 0;
      let totalRecordsProcessed = 0;

      do {
        pageCount++;
        console.log(`Fetching ListRecords page ${pageCount}`);

        let requestUrl;
        if (!resumptionToken) {
          // First request - get initial data
          requestUrl = this.buildListRecordsUrl(oaiUrl);
        } else {
          // Subsequent requests - use resumption token
          requestUrl = this.buildResumptionTokenUrl(oaiUrl, resumptionToken);
        }

        console.log('Making ListRecords request to:', requestUrl);

        // Make HTTP request
        const response = await axios.get(requestUrl, this.axiosConfig);

        if (response.status !== 200) {
          throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }

        if (!response.data) {
          throw new Error('Empty response received from OAI endpoint');
        }

        console.log(
          `Successfully received ListRecords response with ${response.data.length} characters`
        );

        // Parse XML response
        const result = await parseStringPromise(response.data, {
          explicitArray: false,
          ignoreAttrs: false, // Don't ignore attributes to capture resumption token
        });

        if (result && result['OAI-PMH'] && result['OAI-PMH'].ListRecords) {
          const listRecords = result['OAI-PMH'].ListRecords;

          // Count records in this page
          let recordsInPage = 0;
          if (listRecords.record) {
            const records = Array.isArray(listRecords.record)
              ? listRecords.record
              : [listRecords.record];
            recordsInPage = records.length;
            totalRecordsProcessed += recordsInPage;
          }

          // Call the callback function for this page
          await pageCallback(response.data, pageCount, recordsInPage, totalRecordsProcessed);

          console.log(
            `Processed page ${pageCount} with ${recordsInPage} records. Total processed: ${totalRecordsProcessed}`
          );

          // Check for resumption token from already parsed result
          const newResumptionToken = this.extractResumptionTokenFromParsed(listRecords);
          if (newResumptionToken && newResumptionToken !== resumptionToken) {
            resumptionToken = newResumptionToken;
            console.log(`Found resumption token: ${resumptionToken}, continuing pagination...`);
            await this.delay(1000); // 1 second delay between requests
          } else {
            console.log('No resumption token found, pagination complete');
            resumptionToken = null; // End pagination
          }
        } else {
          console.log('No ListRecords found in OAI response or invalid XML structure.');
          resumptionToken = null; // Stop pagination if structure is unexpected
        }

        // Safety check
        if (pageCount >= this.maxPages) {
          console.log(`Reached maximum page limit (${this.maxPages}), stopping pagination`);
          break;
        }
      } while (resumptionToken);

      console.log(
        `ListRecords processing completed. Total pages: ${pageCount}, Total records processed: ${totalRecordsProcessed}`
      );

      return {
        pageCount,
        totalRecordsProcessed,
        success: true,
        status: 'completed',
        errorCode: null,
        errorMessage: null,
      };
    } catch (error) {
      console.error(`Failed to process ListRecords for URL: ${oaiUrl}`, error);

      return {
        pageCount: 0,
        totalRecordsProcessed: 0,
        success: false,
        status: 'failed',
        errorCode: this.getErrorCode(error),
        errorMessage: error.message,
      };
    }
  }

  validateOaiUrl(url) {
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      throw new Error('OAI URL is required');
    }

    try {
      const urlObj = new URL(url);
      if (!urlObj.protocol.startsWith('http')) {
        throw new Error('OAI URL must use HTTP or HTTPS protocol');
      }
    } catch (error) {
      if (error.message.includes('OAI URL must use HTTP or HTTPS protocol')) {
        throw error;
      }
      throw new Error(`Invalid OAI URL format: ${url}`);
    }
  }

  /**
   * Build Identify URL
   */
  buildIdentifyUrl(website) {
    // Ensure website doesn't already end with /oai
    const cleanWebsite = website.replace(/\/oai\/?$/, '');
    return `${cleanWebsite}/oai?verb=Identify`;
  }

  /**
   * Build initial ListRecords URL
   */
  buildListRecordsUrl(website) {
    // Ensure website doesn't already end with /oai
    const cleanWebsite = website.replace(/\/oai\/?$/, '');
    return `${cleanWebsite}/oai?verb=ListRecords&metadataPrefix=oai_dc`;
  }

  /**
   * Build resumption token URL for paginated requests
   */
  buildResumptionTokenUrl(website, token) {
    // Ensure website doesn't already end with /oai
    const cleanWebsite = website.replace(/\/oai\/?$/, '');
    return `${cleanWebsite}/oai?verb=ListRecords&resumptionToken=${encodeURIComponent(token)}`;
  }

  /**
   * Extract resumption token from already parsed ListRecords data
   */
  extractResumptionTokenFromParsed(listRecords) {
    try {
      if (listRecords.resumptionToken) {
        console.log(
          'Found resumptionToken in parsed data:',
          JSON.stringify(listRecords.resumptionToken, null, 2)
        );

        // Check different formats of resumption token
        if (typeof listRecords.resumptionToken === 'string') {
          return listRecords.resumptionToken;
        } else if (listRecords.resumptionToken._) {
          return listRecords.resumptionToken._;
        } else if (listRecords.resumptionToken.$ && listRecords.resumptionToken.$.resumptionToken) {
          return listRecords.resumptionToken.$.resumptionToken;
        } else if (
          listRecords.resumptionToken.$ &&
          listRecords.resumptionToken.$['resumptionToken']
        ) {
          return listRecords.resumptionToken.$['resumptionToken'];
        } else if (
          listRecords.resumptionToken['$'] &&
          listRecords.resumptionToken['$']['resumptionToken']
        ) {
          return listRecords.resumptionToken['$']['resumptionToken'];
        } else {
          // If it's an object, try to extract the token value
          console.log('Resumption token structure:', Object.keys(listRecords.resumptionToken));
          return null;
        }
      }
      return null;
    } catch (error) {
      console.warn('Error extracting resumption token from parsed data:', error.message);
      return null;
    }
  }

  /**
   * Extract resumption token from XML response (legacy method)
   */
  extractResumptionToken(xmlResponse) {
    return new Promise(resolve => {
      const { parseString } = require('xml2js');

      parseString(xmlResponse, (err, result) => {
        if (err) {
          console.warn('Failed to parse XML for resumption token:', err.message);
          resolve(null);
          return;
        }

        try {
          const resumptionToken = result?.['OAI-PMH']?.ListRecords?.resumptionToken;
          if (resumptionToken && resumptionToken._) {
            resolve(resumptionToken._);
          } else {
            resolve(null);
          }
        } catch (error) {
          console.warn('Error extracting resumption token:', error.message);
          resolve(null);
        }
      });
    });
  }

  /**
   * Get standardized error code from error object
   */
  getErrorCode(error) {
    if (!error) return 'UNKNOWN_ERROR';

    // Network/HTTP errors
    if (error.code === 'ECONNREFUSED') return 'CONNECTION_REFUSED';
    if (error.code === 'ENOTFOUND') return 'DNS_RESOLUTION_FAILED';
    if (error.code === 'ETIMEDOUT') return 'TIMEOUT_ERROR';
    if (error.code === 'ECONNRESET') return 'CONNECTION_RESET';

    // HTTP status errors
    if (error.response && error.response.status) {
      const status = error.response.status;
      if (status >= 400 && status < 500) return `HTTP_CLIENT_ERROR_${status}`;
      if (status >= 500 && status < 600) return `HTTP_SERVER_ERROR_${status}`;
      return `HTTP_ERROR_${status}`;
    }

    // Axios specific errors
    if (error.name === 'AxiosError') {
      if (error.code === 'ECONNABORTED') return 'REQUEST_TIMEOUT';
      if (error.code === 'ERR_NETWORK') return 'NETWORK_ERROR';
      return 'AXIOS_ERROR';
    }

    // Generic error types
    if (error.name === 'TypeError') return 'TYPE_ERROR';
    if (error.name === 'SyntaxError') return 'SYNTAX_ERROR';
    if (error.name === 'ReferenceError') return 'REFERENCE_ERROR';

    return 'UNKNOWN_ERROR';
  }

  /**
   * Delay execution for specified milliseconds
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { OaiDataProcessor };
