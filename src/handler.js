const { OaiDataProcessor } = require('./processors/oaiDataProcessor');
const { S3FileProcessor } = require('./processors/s3FileProcessor');
const { SqsMessageProcessor } = require('./processors/sqsMessageProcessor');
const { XmlArticleProcessor } = require('./processors/xmlArticleProcessor');

// Helper function to create error message
const createErrorMessage = (journalKey, oaiUrl, messageType, errorCode, errorMessage) => ({
  journalKey,
  oaiUrl,
  s3Url: null,
  s3Key: null,
  messageType,
  source: 'scraping-service',
  success: false,
  errorCode,
  errorMessage,
  timestamp: new Date().toISOString(),
});

// Helper function to process Identify phase
const processIdentifyPhase = async (
  oaiProcessor,
  s3Processor,
  sqsProcessor,
  articleProcessor,
  url,
  journalKey
) => {
  console.log(`Phase 1: Processing Identify request for journal: ${journalKey}`);

  try {
    const identifyResult = await oaiProcessor.processIdentify(url, journalKey);

    if (identifyResult.success) {
      console.log('Saving Identify data to S3');
      const identifyS3Result = await s3Processor.createAndUploadXml(
        identifyResult.data,
        `${journalKey}-identify`,
        url
      );

      // Parse Identify XML to JSON
      console.log('Parsing Identify XML to JSON');
      const identifyData = await articleProcessor.parseIdentifyXml(identifyResult.data, journalKey);

      console.log('Sending Identify data as JSON to integration queue');
      await sqsProcessor.sendMessage({
        journalKey,
        oaiUrl: url,
        s3Url: identifyS3Result.s3Url,
        s3Key: identifyS3Result.s3Key,
        s3Path: identifyS3Result.s3Path,
        filename: identifyS3Result.filename,
        fileSize: identifyS3Result.fileSize,
        contentType: identifyS3Result.contentType,
        messageType: 'Identify',
        source: 'scraping-service',
        success: true,
        errorCode: null,
        errorMessage: null,
        timestamp: new Date().toISOString(),
        // Add parsed JSON data
        data: identifyData,
      });

      console.log(`Successfully processed Identify phase for journal: ${journalKey}`);
    } else {
      console.error(
        `Identify phase failed for journal: ${journalKey}`,
        identifyResult.errorMessage
      );
      await sqsProcessor.sendMessage(
        createErrorMessage(
          journalKey,
          url,
          'Identify',
          identifyResult.errorCode,
          identifyResult.errorMessage
        )
      );
    }
  } catch (error) {
    console.error(`Failed to process Identify phase for journal: ${journalKey}`, error);
    await sqsProcessor.sendMessage(
      createErrorMessage(journalKey, url, 'Identify', 'IDENTIFY_PROCESSING_ERROR', error.message)
    );
  }
};

// Helper function to create page processing callback
const createPageCallback = (s3Processor, sqsProcessor, articleProcessor, journalKey, url) => {
  return async (pageXml, pageNumber, recordsInPage, recordsProcessed) => {
    console.log(`Processing ListRecords page ${pageNumber} with ${recordsInPage} records`);

    try {
      console.log(`Saving ListRecords page ${pageNumber} to S3`);
      const pageS3Result = await s3Processor.createAndUploadXml(
        pageXml,
        `${journalKey}-listrecords-page-${pageNumber}`,
        url
      );

      // Parse XML and extract individual articles
      console.log(`Parsing ListRecords XML to extract ${recordsInPage} individual articles`);
      const articles = await articleProcessor.parseListRecordsXml(pageXml, journalKey);

      // Batch articles into groups of 50
      const BATCH_SIZE = 50;
      const batches = [];
      for (let i = 0; i < articles.length; i += BATCH_SIZE) {
        batches.push(articles.slice(i, i + BATCH_SIZE));
      }

      console.log(
        `Sending ${articles.length} articles in ${batches.length} batch(es) to integration queue`
      );

      // Send batches to SQS
      let successCount = 0;
      let failureCount = 0;

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];

        try {
          await sqsProcessor.sendMessage({
            journalKey,
            oaiUrl: url,
            s3Url: pageS3Result.s3Url,
            s3Key: pageS3Result.s3Key,
            s3Path: pageS3Result.s3Path,
            s3FileName: pageS3Result.filename,
            messageType: 'ArticleBatch',
            source: 'scraping-service',
            pageNumber,
            batchNumber: batchIndex + 1,
            totalBatches: batches.length,
            articlesInBatch: batch.length,
            totalArticlesInPage: articles.length,
            totalRecordsProcessed: recordsProcessed,
            success: true,
            errorCode: null,
            errorMessage: null,
            timestamp: new Date().toISOString(),
            // Array of articles in this batch
            articles: batch,
          });
          successCount += batch.length;
          console.log(
            `Sent batch ${batchIndex + 1}/${batches.length} with ${batch.length} articles`
          );
        } catch (batchError) {
          console.error(
            `Failed to send batch ${batchIndex + 1} from page ${pageNumber}:`,
            batchError
          );
          failureCount += batch.length;
        }
      }

      console.log(
        `Successfully sent ${successCount}/${articles.length} articles in ${batches.length} batch(es) from page ${pageNumber}. Failures: ${failureCount}`
      );

      // Clear memory by forcing garbage collection
      if (global.gc) {
        global.gc();
      }
    } catch (pageError) {
      console.error(
        `Failed to process ListRecords page ${pageNumber} for journal: ${journalKey}`,
        pageError
      );
      await sqsProcessor.sendMessage({
        ...createErrorMessage(
          journalKey,
          url,
          'ListRecords',
          'PAGE_PROCESSING_FAILED',
          pageError.message
        ),
        pageNumber,
        recordsInPage,
        totalRecordsProcessed: recordsProcessed,
      });
    }
  };
};

// Helper function to process ListRecords phase
const processListRecordsPhase = async (
  oaiProcessor,
  s3Processor,
  sqsProcessor,
  articleProcessor,
  url,
  journalKey
) => {
  console.log(`Phase 2: Processing ListRecords request for journal: ${journalKey}`);

  try {
    const pageCallback = createPageCallback(
      s3Processor,
      sqsProcessor,
      articleProcessor,
      journalKey,
      url
    );
    const listRecordsResult = await oaiProcessor.processListRecords(url, journalKey, pageCallback);

    if (!listRecordsResult.success) {
      console.error(
        `ListRecords phase failed for journal: ${journalKey}`,
        listRecordsResult.errorMessage
      );
      await sqsProcessor.sendMessage(
        createErrorMessage(
          journalKey,
          url,
          'ListRecords',
          listRecordsResult.errorCode,
          listRecordsResult.errorMessage
        )
      );
    } else {
      console.log(
        `Successfully processed ListRecords phase for journal: ${journalKey} - ${listRecordsResult.totalRecordsProcessed} records across ${listRecordsResult.pageCount} pages`
      );
    }
  } catch (error) {
    console.error(`Failed to process ListRecords phase for journal: ${journalKey}`, error);
    await sqsProcessor.sendMessage(
      createErrorMessage(
        journalKey,
        url,
        'ListRecords',
        'LISTRECORDS_PROCESSING_ERROR',
        error.message
      )
    );
  }
};

exports.handler = async event => {
  console.log('Received SQS event with', event.Records?.length || 0, 'records');

  if (!event.Records || event.Records.length === 0) {
    console.log('No records to process');
    return { statusCode: 200, body: 'SUCCESS' };
  }

  const batchItemFailures = [];

  for (const record of event.Records) {
    try {
      console.log('Processing message:', record.messageId);

      // Parse message body
      const messageData = JSON.parse(record.body);
      console.log('Processing SQS message body:', JSON.stringify(messageData, null, 2));

      const { url, journal_key: journalKey } = messageData;

      // Validate required fields
      if (!url || !journalKey) {
        console.error(
          'Missing required fields in SQS message. URL:',
          url,
          'JournalKey:',
          journalKey
        );
        continue;
      }

      console.log('Extracted - URL:', url, 'JournalKey:', journalKey);

      // Initialize processors
      const oaiProcessor = new OaiDataProcessor();
      const s3Processor = new S3FileProcessor();
      const sqsProcessor = new SqsMessageProcessor();
      const articleProcessor = new XmlArticleProcessor();

      // Process both phases
      await processIdentifyPhase(
        oaiProcessor,
        s3Processor,
        sqsProcessor,
        articleProcessor,
        url,
        journalKey
      );
      await processListRecordsPhase(
        oaiProcessor,
        s3Processor,
        sqsProcessor,
        articleProcessor,
        url,
        journalKey
      );

      console.log('Successfully processed message:', record.messageId);
    } catch (error) {
      console.error('Failed to process message:', record.messageId, error);

      // Add to batch item failures for SQS partial batch failure handling
      batchItemFailures.push({
        itemIdentifier: record.messageId,
      });
    }
  }

  // Return batch item failures if any
  if (batchItemFailures.length > 0) {
    console.log(`Returning ${batchItemFailures.length} batch item failures`);
    return {
      statusCode: 200,
      body: 'SUCCESS',
      batchItemFailures,
    };
  }

  return { statusCode: 200, body: 'SUCCESS' };
};
