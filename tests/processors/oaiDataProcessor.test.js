const { OaiDataProcessor } = require('../../src/processors/oaiDataProcessor');

// Mock axios
jest.mock('axios');
const axios = require('axios');

// Mock xml2js
jest.mock('xml2js');
const { parseStringPromise } = require('xml2js');

describe('OaiDataProcessor', () => {
    let processor;
    let mockAxios;

    beforeEach(() => {
        processor = new OaiDataProcessor();
        mockAxios = axios.get.mockResolvedValue({
            status: 200,
            data: '<OAI-PMH><Identify><repositoryName>Test Repository</repositoryName></Identify></OAI-PMH>'
        });
        parseStringPromise.mockResolvedValue({
            'OAI-PMH': {
                Identify: {
                    repositoryName: 'Test Repository'
                }
            }
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('processIdentify', () => {
        it('should successfully process Identify request', async () => {
            const oaiUrl = 'https://example.com/oai';
            const journalKey = 'test-journal';

            const result = await processor.processIdentify(oaiUrl, journalKey);

            expect(result).toEqual({
                data: '<OAI-PMH><Identify><repositoryName>Test Repository</repositoryName></Identify></OAI-PMH>',
                type: 'Identify',
                success: true,
                status: 'completed',
                errorCode: null,
                errorMessage: null,
                url: 'https://example.com/oai?verb=Identify'
            });

            expect(mockAxios).toHaveBeenCalledWith(
                'https://example.com/oai?verb=Identify',
                expect.any(Object)
            );
        });

        it('should handle Identify request with trailing slash in URL', async () => {
            const oaiUrl = 'https://example.com/oai/';
            const journalKey = 'test-journal';

            await processor.processIdentify(oaiUrl, journalKey);

            expect(mockAxios).toHaveBeenCalledWith(
                'https://example.com/oai?verb=Identify',
                expect.any(Object)
            );
        });

        it('should handle HTTP errors in Identify request', async () => {
            mockAxios.mockRejectedValue({
                response: { status: 404 },
                message: 'HTTP 404 Not Found'
            });

            const result = await processor.processIdentify('https://example.com/oai', 'test-journal');

            expect(result).toEqual({
                data: null,
                type: 'Identify',
                success: false,
                status: 'failed',
                errorCode: 'HTTP_CLIENT_ERROR_404',
                errorMessage: 'HTTP 404 Not Found',
                url: 'https://example.com/oai'
            });
        });

        it('should handle network errors in Identify request', async () => {
            mockAxios.mockRejectedValue({
                code: 'ECONNREFUSED',
                message: 'Connection refused'
            });

            const result = await processor.processIdentify('https://example.com/oai', 'test-journal');

            expect(result).toEqual({
                data: null,
                type: 'Identify',
                success: false,
                status: 'failed',
                errorCode: 'CONNECTION_REFUSED',
                errorMessage: 'Connection refused',
                url: 'https://example.com/oai'
            });
        });

        it('should validate OAI URL format', async () => {
            await expect(processor.processIdentify('invalid-url', 'test-journal'))
                .resolves.toEqual(expect.objectContaining({
                    success: false,
                    errorCode: expect.any(String),
                    errorMessage: expect.stringContaining('Invalid OAI URL format')
                }));
        });

        it('should require non-empty OAI URL', async () => {
            await expect(processor.processIdentify('', 'test-journal'))
                .resolves.toEqual(expect.objectContaining({
                    success: false,
                    errorCode: expect.any(String),
                    errorMessage: 'OAI URL is required'
                }));
        });
    });

    describe('processListRecords', () => {
        beforeEach(() => {
            parseStringPromise.mockResolvedValue({
                'OAI-PMH': {
                    ListRecords: {
                        record: [
                            { header: { identifier: 'record1' }, metadata: { title: 'Test 1' } },
                            { header: { identifier: 'record2' }, metadata: { title: 'Test 2' } }
                        ]
                    }
                }
            });
        });

        it('should successfully process ListRecords request without pagination', async () => {
            const oaiUrl = 'https://example.com/oai';
            const journalKey = 'test-journal';
            const mockCallback = jest.fn().mockResolvedValue();

            const result = await processor.processListRecords(oaiUrl, journalKey, mockCallback);

            expect(result).toEqual({
                pageCount: 1,
                totalRecordsProcessed: 2,
                success: true,
                status: 'completed',
                errorCode: null,
                errorMessage: null
            });

            expect(mockCallback).toHaveBeenCalledTimes(1);
            expect(mockCallback).toHaveBeenCalledWith(
                '<OAI-PMH><Identify><repositoryName>Test Repository</repositoryName></Identify></OAI-PMH>',
                1,
                2,
                2
            );
        });

        it('should process ListRecords request with pagination', async () => {
            // Mock first page with resumption token
            parseStringPromise
                .mockResolvedValueOnce({
                    'OAI-PMH': {
                        ListRecords: {
                            record: [
                                { header: { identifier: 'record1' }, metadata: { title: 'Test 1' } }
                            ],
                            resumptionToken: { _: 'token123' }
                        }
                    }
                })
                // Mock second page without resumption token
                .mockResolvedValueOnce({
                    'OAI-PMH': {
                        ListRecords: {
                            record: [
                                { header: { identifier: 'record2' }, metadata: { title: 'Test 2' } }
                            ]
                        }
                    }
                });

            const mockCallback = jest.fn().mockResolvedValue();

            const result = await processor.processListRecords('https://example.com/oai', 'test-journal', mockCallback);

            expect(result).toEqual({
                pageCount: 2,
                totalRecordsProcessed: 2,
                success: true,
                status: 'completed',
                errorCode: null,
                errorMessage: null
            });

            expect(mockCallback).toHaveBeenCalledTimes(2);
            expect(mockAxios).toHaveBeenCalledTimes(2);
            expect(mockAxios).toHaveBeenNthCalledWith(1, 'https://example.com/oai?verb=ListRecords&metadataPrefix=oai_dc', expect.any(Object));
            expect(mockAxios).toHaveBeenNthCalledWith(2, 'https://example.com/oai?verb=ListRecords&resumptionToken=token123', expect.any(Object));
        });

        it('should handle ListRecords with single record (not array)', async () => {
            parseStringPromise.mockResolvedValue({
                'OAI-PMH': {
                    ListRecords: {
                        record: { header: { identifier: 'single-record' }, metadata: { title: 'Single Test' } }
                    }
                }
            });

            const mockCallback = jest.fn().mockResolvedValue();

            const result = await processor.processListRecords('https://example.com/oai', 'test-journal', mockCallback);

            expect(result.totalRecordsProcessed).toBe(1);
            expect(mockCallback).toHaveBeenCalledTimes(1);
        });

        it('should handle ListRecords with no records', async () => {
            parseStringPromise.mockResolvedValue({
                'OAI-PMH': {
                    ListRecords: {}
                }
            });

            const mockCallback = jest.fn().mockResolvedValue();

            const result = await processor.processListRecords('https://example.com/oai', 'test-journal', mockCallback);

            expect(result.totalRecordsProcessed).toBe(0);
            expect(mockCallback).toHaveBeenCalledTimes(1);
        });

        it('should handle HTTP errors in ListRecords request', async () => {
            mockAxios.mockRejectedValue({
                response: { status: 500 },
                message: 'Internal Server Error'
            });

            const mockCallback = jest.fn().mockResolvedValue();

            const result = await processor.processListRecords('https://example.com/oai', 'test-journal', mockCallback);

            expect(result).toEqual({
                pageCount: 0,
                totalRecordsProcessed: 0,
                success: false,
                status: 'failed',
                errorCode: 'HTTP_SERVER_ERROR_500',
                errorMessage: 'Internal Server Error'
            });
        });

        it('should respect maximum page limit', async () => {
            // Mock many pages with resumption tokens
            parseStringPromise.mockResolvedValue({
                'OAI-PMH': {
                    ListRecords: {
                        record: [{ header: { identifier: 'record' }, metadata: { title: 'Test' } }],
                        resumptionToken: { _: 'token123' }
                    }
                }
            });

            processor.maxPages = 2; // Set low limit for testing
            const mockCallback = jest.fn().mockResolvedValue();

            const result = await processor.processListRecords('https://example.com/oai', 'test-journal', mockCallback);

            expect(result.pageCount).toBe(2);
            expect(mockAxios).toHaveBeenCalledTimes(2);
        });

        it('should handle callback errors gracefully', async () => {
            const mockCallback = jest.fn().mockRejectedValue(new Error('Callback failed'));

            const result = await processor.processListRecords('https://example.com/oai', 'test-journal', mockCallback);

            expect(result.success).toBe(false);
            expect(result.errorMessage).toContain('Callback failed');
        });
    });

    describe('URL building methods', () => {
        it('should build correct Identify URL', () => {
            const result = processor.buildIdentifyUrl('https://example.com/oai');
            expect(result).toBe('https://example.com/oai?verb=Identify');
        });

        it('should build correct ListRecords URL', () => {
            const result = processor.buildListRecordsUrl('https://example.com/oai');
            expect(result).toBe('https://example.com/oai?verb=ListRecords&metadataPrefix=oai_dc');
        });

        it('should build correct resumption token URL', () => {
            const result = processor.buildResumptionTokenUrl('https://example.com/oai', 'test-token');
            expect(result).toBe('https://example.com/oai?verb=ListRecords&resumptionToken=test-token');
        });

        it('should handle URLs with trailing slashes', () => {
            expect(processor.buildIdentifyUrl('https://example.com/oai/')).toBe('https://example.com/oai?verb=Identify');
            expect(processor.buildListRecordsUrl('https://example.com/oai/')).toBe('https://example.com/oai?verb=ListRecords&metadataPrefix=oai_dc');
        });
    });

    describe('resumption token extraction', () => {
        it('should extract resumption token from XML', async () => {
            const xmlResponse = `
                <OAI-PMH>
                    <ListRecords>
                        <resumptionToken>test-token-123</resumptionToken>
                    </ListRecords>
                </OAI-PMH>
            `;

            parseStringPromise.mockResolvedValue({
                'OAI-PMH': {
                    ListRecords: {
                        resumptionToken: { _: 'test-token-123' }
                    }
                }
            });

            const result = await processor.extractResumptionToken(xmlResponse);
            expect(result).toBe('test-token-123');
        });

        it('should return null when no resumption token', async () => {
            const xmlResponse = `
                <OAI-PMH>
                    <ListRecords>
                        <record>test record</record>
                    </ListRecords>
                </OAI-PMH>
            `;

            parseStringPromise.mockResolvedValue({
                'OAI-PMH': {
                    ListRecords: {
                        record: 'test record'
                    }
                }
            });

            const result = await processor.extractResumptionToken(xmlResponse);
            expect(result).toBeNull();
        });

        it('should handle XML parsing errors', async () => {
            parseStringPromise.mockRejectedValue(new Error('Parse error'));

            const result = await processor.extractResumptionToken('invalid xml');
            expect(result).toBeNull();
        });
    });

    describe('error code mapping', () => {
        it('should map network errors correctly', () => {
            expect(processor.getErrorCode({ code: 'ECONNREFUSED' })).toBe('CONNECTION_REFUSED');
            expect(processor.getErrorCode({ code: 'ENOTFOUND' })).toBe('DNS_RESOLUTION_FAILED');
            expect(processor.getErrorCode({ code: 'ETIMEDOUT' })).toBe('TIMEOUT_ERROR');
        });

        it('should map HTTP status codes correctly', () => {
            expect(processor.getErrorCode({ response: { status: 404 } })).toBe('HTTP_CLIENT_ERROR_404');
            expect(processor.getErrorCode({ response: { status: 500 } })).toBe('HTTP_SERVER_ERROR_500');
        });

        it('should map Axios errors correctly', () => {
            expect(processor.getErrorCode({ name: 'AxiosError', code: 'ECONNABORTED' })).toBe('REQUEST_TIMEOUT');
            expect(processor.getErrorCode({ name: 'AxiosError', code: 'ERR_NETWORK' })).toBe('NETWORK_ERROR');
        });

        it('should handle unknown errors', () => {
            expect(processor.getErrorCode({ message: 'Unknown error' })).toBe('UNKNOWN_ERROR');
            expect(processor.getErrorCode(null)).toBe('UNKNOWN_ERROR');
        });
    });
});