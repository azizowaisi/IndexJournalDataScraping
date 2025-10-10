# SQS Message Format

## Overview

This document describes the SQS message formats sent to the integration queue after processing OAI-PMH data.

## Message Types

### 1. Article Message (ListRecords)

Each article from ListRecords is sent as an individual message with the following structure:

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
    "datestamp": "2009-06-30"
  }
}
```

### 2. Identify Message

Repository identification data is sent as a single message:

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

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `journal_key` | string | Journal identifier |
| `created_at` | string (ISO 8601) | Timestamp when the record was created |
| `type` | string | "ListRecords" or "Identify" |

### Article-Specific Fields (ListRecords)

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Article title |
| `title_lang` | string (optional) | Language code (e.g., "en-US") |
| `creator` | string | First author/creator name |
| `subjects` | array[string] | List of subject keywords |
| `description` | string | Article abstract/description |
| `description_lang` | string (optional) | Language code |
| `publisher` | string | Publisher name |
| `publisher_lang` | string (optional) | Language code |
| `date` | string | Publication date (YYYY-MM-DD) |
| `types` | array[string] | Document types |
| `format` | string | Content format (e.g., "application/pdf") |
| `identifier` | string | Article URL or DOI |
| `sources` | array[string] | Source identifiers (journal name, ISSN, etc.) |
| `language` | string | Content language code |
| `relation` | string (optional) | Related resource URL |
| `datestamp` | string (optional) | OAI-PMH datestamp |

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

## Error Messages

When processing fails, an error message is sent:

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

## Changes from Previous Version

### What Changed

1. **Article data structure**: Changed from flat structure to nested `article` object
2. **Field names**: 
   - `journalKey` remains at top level
   - Article data now uses `journal_key` (snake_case) internally
   - `creator` now returns first creator as string (not array)
   - `subject` → `subjects` (array)
   - `type` (dc:type) → `types` (array)
   - `source` → `sources` (array)
3. **New fields**:
   - `created_at`: Auto-generated timestamp
   - `type`: "ListRecords" or "Identify"
   - `title_lang`, `description_lang`, `publisher_lang`: Language attributes
4. **Message processor**: Now preserves all incoming fields instead of filtering

### Migration Guide

**Before:**
```json
{
  "journalKey": "...",
  "s3Key": "...",
  "s3Url": "...",
  "messageType": "file-processing-request"
}
```

**After:**
```json
{
  "journalKey": "...",
  "s3Key": "...",
  "s3Url": "...",
  "messageType": "Article",
  "article": {
    "journal_key": "...",
    "created_at": "...",
    "type": "ListRecords",
    "title": "...",
    "subjects": [...],
    ...
  }
}
```

## Usage

To process these messages in the integration service:

```javascript
// Parse SQS message
const message = JSON.parse(event.Records[0].body);

if (message.messageType === 'Article') {
  const article = message.article;
  console.log(`Processing article: ${article.title}`);
  console.log(`Journal: ${article.journal_key}`);
  console.log(`Subjects: ${article.subjects.join(', ')}`);
}

if (message.messageType === 'Identify') {
  const repo = message.data;
  console.log(`Repository: ${repo.repositoryName}`);
}
```

