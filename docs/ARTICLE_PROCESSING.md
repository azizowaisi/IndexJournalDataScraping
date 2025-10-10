# Article Processing Feature

## Overview

The system parses XML files from OAI-PMH sources, extracts individual articles, converts them to structured JSON, and sends each article as a separate message to the SQS integration queue.

## Architecture

### Flow

1. **Fetch OAI-PMH Data** - Retrieve XML from OAI endpoints (Identify and ListRecords)
2. **Save to S3** - Original XML files are saved to S3 for backup/audit purposes
3. **Parse XML** - Extract individual article records from the XML
4. **Convert to JSON** - Transform Dublin Core metadata to structured JSON format
5. **Send Individual Messages** - Each article is sent as a separate SQS message

### Components

#### 1. XmlArticleProcessor (`src/processors/xmlArticleProcessor.js`)

Handles XML parsing and conversion:
- **`parseIdentifyXml(xmlData, journalKey)`** - Parses OAI-PMH Identify response
- **`parseListRecordsXml(xmlData, journalKey)`** - Extracts individual records from ListRecords
- **`parseIndividualRecord(record, index, journalKey)`** - Converts single record to JSON
- **`extractValueWithLang(field)`** - Extracts values with language attributes
- **`validateOaiXml(xmlData)`** - Validates OAI-PMH XML structure

#### 2. Modified Handler (`src/handler.js`)

The handler orchestrates the processing:
- Saves XML files to S3 (unchanged)
- Calls XML parser to extract articles
- Sends one SQS message per article (instead of per page)
- Includes parsed JSON data in each message

#### 3. SQS Message Processor (`src/processors/sqsMessageProcessor.js`)

Sends messages to integration queue:
- **`sendMessage(messageData)`** - Preserves all incoming fields
- No filtering or transformation - passes everything through

## Message Formats

### Article Message (One per article from ListRecords)

```json
{
  "journalKey": "68653804af297",
  "oaiUrl": "https://pjss.bzu.edu.pk/oai/request",
  "s3Url": "https://index-journal-files.s3.ap-south-1.amazonaws.com/2025/10/10/...",
  "s3Key": "2025/10/10/68653804af297-listrecords-page-4/...",
  "s3Path": "s3://index-journal-files/2025/10/10/...",
  "s3FileName": "68653804af297-listrecords-page-4_20251010_074806.xml",
  "messageType": "Article",
  "source": "scraping-service",
  "pageNumber": 4,
  "articleNumber": 1,
  "totalArticlesInPage": 10,
  "totalRecordsProcessed": 31,
  "success": true,
  "errorCode": null,
  "errorMessage": null,
  "timestamp": "2025-10-10T07:48:07.261Z",
  
  "article": {
    "journal_key": "68653804af297",
    "created_at": "2025-10-10T07:48:07.261Z",
    "type": "ListRecords",
    
    "title": "Developments in Teaching, Learning and Assessment Practices in Higher Education",
    "title_lang": "en-US",
    
    "creator": "Malik, Muhammad Ali",
    
    "subjects": [
      "Teaching",
      "Learning",
      "Assessment",
      "PBL",
      "Reflective Approach",
      "Higher Education",
      "Participative Assessment",
      "Learner-Centered"
    ],
    
    "description": "This paper addresses the issues of teaching, learning and assessment...",
    "description_lang": "en-US",
    
    "publisher": "Bahauddin Zakaria University, Multan, Pakistan",
    "publisher_lang": "en-US",
    
    "date": "2009-06-30",
    
    "types": [
      "info:eu-repo/semantics/article",
      "info:eu-repo/semantics/publishedVersion",
      "Peer-reviewed Article"
    ],
    
    "format": "application/pdf",
    
    "identifier": "https://pjss.bzu.edu.pk/index.php/pjss/article/view/6",
    
    "sources": [
      "Pakistan Journal of Social Sciences; Vol. 29 No. 1 (2009); 1-11",
      "2708-4175",
      "2074-2061"
    ],
    
    "language": "eng",
    
    "relation": "https://pjss.bzu.edu.pk/index.php/pjss/article/view/6/6",
    
    "datestamp": "2009-06-30",
    "setSpec": "article"
  }
}
```

### Identify Message

```json
{
  "journalKey": "68653804af297",
  "oaiUrl": "https://pjss.bzu.edu.pk/oai/request",
  "s3Url": "https://index-journal-files.s3.ap-south-1.amazonaws.com/...",
  "s3Key": "2025/10/10/68653804af297-identify/...",
  "s3Path": "s3://index-journal-files/2025/10/10/...",
  "filename": "68653804af297-identify_20251010_074806.xml",
  "fileSize": 1234,
  "contentType": "application/xml",
  "messageType": "Identify",
  "source": "scraping-service",
  "success": true,
  "errorCode": null,
  "errorMessage": null,
  "timestamp": "2025-10-10T07:48:07.261Z",
  
  "data": {
    "journal_key": "68653804af297",
    "created_at": "2025-10-10T07:48:07.261Z",
    "type": "Identify",
    "repositoryName": "Pakistan Journal of Social Sciences",
    "baseURL": "https://pjss.bzu.edu.pk/oai/request",
    "protocolVersion": "2.0",
    "adminEmail": "admin@bzu.edu.pk",
    "earliestDatestamp": "2009-01-01",
    "deletedRecord": "no",
    "granularity": "YYYY-MM-DD"
  }
}
```

## Article Data Structure

### Required Fields (All articles)

| Field | Type | Description |
|-------|------|-------------|
| `journal_key` | string | Journal identifier |
| `created_at` | string (ISO 8601) | Timestamp when the record was parsed |
| `type` | string | "ListRecords" for articles, "Identify" for repository info |

### Article-Specific Fields (ListRecords)

| Field | Type | Optional | Description |
|-------|------|----------|-------------|
| `title` | string | No | Article title |
| `title_lang` | string | Yes | Language code (e.g., "en-US") |
| `creator` | string | Yes | First author/creator name |
| `subjects` | array[string] | Yes | List of subject keywords |
| `description` | string | Yes | Article abstract/description |
| `description_lang` | string | Yes | Language code for description |
| `publisher` | string | Yes | Publisher name |
| `publisher_lang` | string | Yes | Language code for publisher |
| `date` | string | Yes | Publication date (YYYY-MM-DD) |
| `types` | array[string] | Yes | Document types (dc:type values) |
| `format` | string | Yes | Content format (e.g., "application/pdf") |
| `identifier` | string | Yes | Article URL or DOI |
| `sources` | array[string] | Yes | Source identifiers (journal name, ISSN, etc.) |
| `language` | string | Yes | Content language code |
| `relation` | string | Yes | Related resource URL |
| `datestamp` | string | Yes | OAI-PMH datestamp |
| `setSpec` | string | Yes | OAI-PMH set specification |

### Identify-Specific Fields

| Field | Type | Description |
|-------|------|-------------|
| `repositoryName` | string | Name of the repository |
| `baseURL` | string | OAI-PMH base URL |
| `protocolVersion` | string | OAI-PMH protocol version |
| `adminEmail` | string | Administrator email |
| `earliestDatestamp` | string | Earliest record date |
| `deletedRecord` | string | Deletion policy |
| `granularity` | string | Datestamp granularity |

## Field Mapping Changes

### From Previous Version

| Old Field | New Field | Type Change | Notes |
|-----------|-----------|-------------|-------|
| `creator` (array) | `creator` (string) | Array → String | Now returns first creator only |
| `subject` | `subjects` | Renamed | More accurate plural form |
| `type` | `types` | Renamed | Array of dc:type values |
| `source` | `sources` | Renamed | Array of source identifiers |
| N/A | `journal_key` | New | Added to article data |
| N/A | `created_at` | New | Auto-generated timestamp |
| N/A | `type` | New | "ListRecords" or "Identify" |
| N/A | `title_lang` | New | Language attribute support |
| N/A | `description_lang` | New | Language attribute support |
| N/A | `publisher_lang` | New | Language attribute support |

## Benefits

1. **Granular Processing** - Each article can be processed independently
2. **Better Error Handling** - Failures in one article don't affect others
3. **Easier Debugging** - Individual articles can be tracked and retried
4. **Structured Data** - JSON format is easier to work with than XML
5. **Language Support** - Proper handling of multilingual metadata
6. **Type Safety** - Clear distinction between single and multi-value fields
7. **Backward Compatible** - XML files are still saved to S3 for reference

## Processing Flow Example

For a journal with 150 articles across 3 pages:

### Phase 1: Identify
1. Fetch Identify XML from OAI endpoint
2. Save Identify XML to S3 (1 file)
3. Parse Identify XML to JSON
4. Send 1 Identify message with parsed data

### Phase 2: ListRecords
**Page 1 (50 articles):**
1. Fetch ListRecords page 1 XML
2. Save XML to S3 (1 file)
3. Parse XML and extract 50 articles
4. Send 50 individual Article messages

**Page 2 (50 articles):**
1. Fetch ListRecords page 2 XML (using resumption token)
2. Save XML to S3 (1 file)
3. Parse XML and extract 50 articles
4. Send 50 individual Article messages

**Page 3 (50 articles):**
1. Fetch ListRecords page 3 XML (using resumption token)
2. Save XML to S3 (1 file)
3. Parse XML and extract 50 articles
4. Send 50 individual Article messages

**Total:**
- **4 XML files** saved to S3 (1 Identify + 3 ListRecords pages)
- **151 SQS messages** sent (1 Identify + 150 Articles)

Each message references the original S3 XML file via `s3Url`, `s3Key`, and `s3Path` for traceability.

## Testing

All functionality is thoroughly tested:

- **`xmlArticleProcessor.test.js`** - 27 tests for XML parsing and conversion
- **`handler.test.js`** - Updated for article-based messaging
- **`sqsMessageProcessor.test.js`** - 13 tests for message sending
- **`s3FileProcessor.test.js`** - 21 tests for S3 operations
- **`oaiDataProcessor.test.js`** - 21 tests for OAI data fetching

**Total: ✅ 95/95 tests passing**

## Integration Service Changes Required

If you're consuming these messages in an integration service, update your code:

### Before
```javascript
const message = JSON.parse(event.Records[0].body);
const s3Key = message.s3Key;
// Download and parse XML from S3
```

### After
```javascript
const message = JSON.parse(event.Records[0].body);

if (message.messageType === 'Article') {
  const article = message.article;
  
  console.log(`Processing: ${article.title}`);
  console.log(`Journal: ${article.journal_key}`);
  console.log(`Date: ${article.date}`);
  console.log(`Subjects: ${article.subjects.join(', ')}`);
  console.log(`Authors: ${article.creator}`);
  
  // Process article directly - no need to download XML
}

if (message.messageType === 'Identify') {
  const repo = message.data;
  console.log(`Repository: ${repo.repositoryName}`);
}
```

## Error Handling

When processing fails, error messages are sent:

```json
{
  "journalKey": "68653804af297",
  "oaiUrl": "https://example.com/oai",
  "s3Url": null,
  "s3Key": null,
  "messageType": "ListRecords",
  "source": "scraping-service",
  "success": false,
  "errorCode": "NETWORK_ERROR",
  "errorMessage": "Failed to connect to OAI-PMH endpoint",
  "timestamp": "2025-10-10T07:48:07.261Z"
}
```

## See Also

- [SQS Message Format Documentation](SQS-MESSAGE-FORMAT.md) - Complete message format reference
- [Main README](../README.md) - Project overview and setup
- [Sample Article Output](sample-article-output.json) - Example article JSON
