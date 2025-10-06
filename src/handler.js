const { OaiDataProcessor } = require('./processors/oaiDataProcessor');
const { S3FileProcessor } = require('./processors/s3FileProcessor');
const { SqsMessageProcessor } = require('./processors/sqsMessageProcessor');

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

      // PHASE 1: Process Identify request
      console.log(`Phase 1: Processing Identify request for journal: ${journalKey}`);

      try {
        const identifyResult = await oaiProcessor.processIdentify(url, journalKey);

        if (identifyResult.success) {
          // Save Identify data to S3
          console.log('Saving Identify data to S3');
          const identifyS3Result = await s3Processor.createAndUploadXml(
            identifyResult.data,
            `${journalKey}-identify`,
            url
          );

          // Send SQS message for Identify phase
          console.log('Sending Identify message to integration queue');
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
          });

          console.log(`Successfully processed Identify phase for journal: ${journalKey}`);
        } else {
          console.error(
            `Identify phase failed for journal: ${journalKey}`,
            identifyResult.errorMessage
          );

          // Send error message for Identify phase
          await sqsProcessor.sendMessage({
            journalKey,
            oaiUrl: url,
            s3Url: null,
            s3Key: null,
            messageType: 'Identify',
            source: 'scraping-service',
            success: false,
            errorCode: identifyResult.errorCode,
            errorMessage: identifyResult.errorMessage,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error(`Failed to process Identify phase for journal: ${journalKey}`, error);

        // Send error message for Identify phase
        await sqsProcessor.sendMessage({
          journalKey,
          oaiUrl: url,
          s3Url: null,
          s3Key: null,
          messageType: 'Identify',
          source: 'scraping-service',
          success: false,
          errorCode: 'IDENTIFY_PROCESSING_ERROR',
          errorMessage: error.message,
          timestamp: new Date().toISOString(),
        });
      }

      // PHASE 2: Process ListRecords request with pagination
      console.log(`Phase 2: Processing ListRecords request for journal: ${journalKey}`);

      try {
        const listRecordsResult = await oaiProcessor.processListRecords(
          url,
          journalKey,
          async (pageXml, pageNumber, recordsInPage, recordsProcessed) => {
            console.log(`Processing ListRecords page ${pageNumber} with ${recordsInPage} records`);

            try {
              // Save each page as SEPARATE file to S3
              console.log(`Saving ListRecords page ${pageNumber} to S3`);
              const pageS3Result = await s3Processor.createAndUploadXml(
                pageXml,
                `${journalKey}-listrecords-page-${pageNumber}`,
                url
              );

              // Send SQS message for this specific page
              console.log(`Sending ListRecords page ${pageNumber} message to integration queue`);
              await sqsProcessor.sendMessage({
                journalKey,
                oaiUrl: url,
                s3Url: pageS3Result.s3Url,
                s3Key: pageS3Result.s3Key,
                s3Path: pageS3Result.s3Path,
                filename: pageS3Result.filename,
                fileSize: pageS3Result.fileSize,
                contentType: pageS3Result.contentType,
                messageType: 'ListRecords',
                source: 'scraping-service',
                pageNumber,
                recordsInPage,
                totalRecordsProcessed: recordsProcessed,
                success: true,
                errorCode: null,
                errorMessage: null,
                timestamp: new Date().toISOString(),
              });

              console.log(
                `Successfully processed and sent ListRecords page ${pageNumber} for journal: ${journalKey}`
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

              // Send error message for this specific page
              await sqsProcessor.sendMessage({
                journalKey,
                oaiUrl: url,
                s3Url: null,
                s3Key: null,
                messageType: 'ListRecords',
                source: 'scraping-service',
                pageNumber,
                recordsInPage,
                totalRecordsProcessed: recordsProcessed,
                success: false,
                errorCode: 'PAGE_PROCESSING_FAILED',
                errorMessage: pageError.message,
                timestamp: new Date().toISOString(),
              });
            }
          }
        );

        if (!listRecordsResult.success) {
          console.error(
            `ListRecords phase failed for journal: ${journalKey}`,
            listRecordsResult.errorMessage
          );

          // Send error message for ListRecords phase
          await sqsProcessor.sendMessage({
            journalKey,
            oaiUrl: url,
            s3Url: null,
            s3Key: null,
            messageType: 'ListRecords',
            source: 'scraping-service',
            success: false,
            errorCode: listRecordsResult.errorCode,
            errorMessage: listRecordsResult.errorMessage,
            timestamp: new Date().toISOString(),
          });
        } else {
          console.log(
            `Successfully processed ListRecords phase for journal: ${journalKey} - ${listRecordsResult.totalRecordsProcessed} records across ${listRecordsResult.pageCount} pages`
          );
        }
      } catch (error) {
        console.error(`Failed to process ListRecords phase for journal: ${journalKey}`, error);

        // Send error message for ListRecords phase
        await sqsProcessor.sendMessage({
          journalKey,
          oaiUrl: url,
          s3Url: null,
          s3Key: null,
          messageType: 'ListRecords',
          source: 'scraping-service',
          success: false,
          errorCode: 'LISTRECORDS_PROCESSING_ERROR',
          errorMessage: error.message,
          timestamp: new Date().toISOString(),
        });
      }

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
