// Mock Axios for testing

const mockAxiosResponse = {
  data: `<?xml version="1.0" encoding="UTF-8"?>
<OAI-PMH xmlns="http://www.openarchives.org/OAI/2.0/" 
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://www.openarchives.org/OAI/2.0/
         http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd">
  <responseDate>2024-01-01T00:00:00Z</responseDate>
  <request verb="ListRecords" metadataPrefix="oai_dc">https://example.com/oai</request>
  <ListRecords>
    <record>
      <header>
        <identifier>oai:example.com:123</identifier>
        <datestamp>2024-01-01</datestamp>
      </header>
      <metadata>
        <oai_dc:dc xmlns:oai_dc="http://www.openarchives.org/OAI/2.0/oai_dc/" 
                   xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:title>Test Article Title</dc:title>
          <dc:creator>Test Author</dc:creator>
          <dc:date>2024-01-01</dc:date>
        </oai_dc:dc>
      </metadata>
    </record>
    <resumptionToken>test-resumption-token-123</resumptionToken>
  </ListRecords>
</OAI-PMH>`,
  status: 200,
  statusText: 'OK',
  headers: {},
  config: {},
  request: {}
};

const axios = jest.fn(() => Promise.resolve(mockAxiosResponse));

axios.get = jest.fn(() => Promise.resolve(mockAxiosResponse));
axios.post = jest.fn(() => Promise.resolve(mockAxiosResponse));
axios.put = jest.fn(() => Promise.resolve(mockAxiosResponse));
axios.delete = jest.fn(() => Promise.resolve(mockAxiosResponse));
axios.create = jest.fn(() => axios);

module.exports = axios;
