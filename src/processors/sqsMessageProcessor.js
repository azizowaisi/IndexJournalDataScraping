const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

/**
 * Processor for handling SQS message operations
 */
class SqsMessageProcessor {
  constructor() {
    this.sqsClient = new SQSClient();
    this.integrationQueueUrl = process.env.SQS_INTEGRATION_QUEUE_URL;

    if (!this.integrationQueueUrl) {
      throw new Error('SQS_INTEGRATION_QUEUE_URL environment variable is required');
    }
  }

  /**
   * Send message to integration queue
   */
  async sendMessage(messageData) {
    console.log('Processing SQS message for journal:', messageData.journalKey);
    console.log('Message Type:', messageData.messageType);

    try {
      // Create message with all provided data
      const message = {
        // Spread all incoming messageData to preserve everything
        ...messageData,
        
        // Ensure timestamp is set
        timestamp: messageData.timestamp || new Date().toISOString(),
      };

      // Send message to integration queue
      const messageId = await this.sendMessageToQueue(this.integrationQueueUrl, message);

      console.log('Successfully sent message to integration queue:', messageId);

      return messageId;
    } catch (error) {
      console.error('Failed to process SQS message for journal:', messageData.journalKey, error);
      throw error;
    }
  }

  /**
   * Send individual record message to integration queue
   */
  async sendRecordMessage(messageData) {
    try {
      const message = {
        // Journal information
        journalKey: messageData.journalKey,
        oaiUrl: messageData.oaiUrl,

        // Record information
        recordNumber: messageData.recordNumber,
        pageNumber: messageData.pageNumber,

        // S3 information
        s3Bucket: messageData.s3Bucket,
        s3Key: messageData.s3Key,
        s3Url: messageData.s3Url,
        s3Path: messageData.s3Path,
        filename: messageData.filename,
        fileSize: messageData.fileSize,
        contentType: messageData.contentType || 'application/xml',

        // Message metadata
        messageType: 'record-processing-request',
        source: 'scraping-service',
        timestamp: new Date().toISOString(),
      };

      // Send message to integration queue
      const messageId = await this.sendMessageToQueue(this.integrationQueueUrl, message);

      console.log(
        `Successfully sent record message to integration queue for record ${messageData.recordNumber}:`,
        messageId
      );

      return messageId;
    } catch (error) {
      console.error(
        `Failed to send record message for record ${messageData.recordNumber} of journal:`,
        messageData.journalKey,
        error
      );
      throw error;
    }
  }

  /**
   * Send message to SQS queue
   */
  async sendMessageToQueue(queueUrl, messageData) {
    try {
      const params = {
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(messageData),
        MessageAttributes: {
          messageType: {
            DataType: 'String',
            StringValue: messageData.messageType || 'file-processing-request',
          },
          source: {
            DataType: 'String',
            StringValue: messageData.source || 'scraping-service',
          },
          journalKey: {
            DataType: 'String',
            StringValue: messageData.journalKey,
          },
        },
      };

      const command = new SendMessageCommand(params);
      const result = await this.sqsClient.send(command);
      return result.MessageId;
    } catch (error) {
      console.error('Failed to send message to SQS queue:', queueUrl, error);
      throw new Error(`Failed to send message to SQS: ${error.message}`);
    }
  }
}

module.exports = { SqsMessageProcessor };
