/**
 * Cloudflare R2 Storage Module
 * Handles photo uploads and downloads from Cloudflare R2
 */

const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const logger = require('./logger');

// Initialize R2 client (S3-compatible)
const r2Client = new S3Client({
  region: 'auto', // R2 uses 'auto' for region
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = process.env.R2_PUBLIC_URL;

/**
 * Upload a file buffer to R2
 * @param {Buffer} fileBuffer - File data
 * @param {string} fileName - Desired file name
 * @param {string} contentType - MIME type (e.g., 'image/jpeg')
 * @param {string} sessionId - Session ID for organizing files
 * @returns {Promise<string>} Public URL of uploaded file
 */
async function uploadToR2(fileBuffer, fileName, contentType, sessionId) {
  try {
    // Generate key with session organization
    const timestamp = Date.now();
    const key = `sessions/${sessionId}/${timestamp}_${fileName}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    await r2Client.send(command);

    // Construct public URL
    const publicUrl = `${PUBLIC_URL}/${key}`;

    logger.info('File uploaded to R2 successfully', {
      key,
      publicUrl,
      sessionId,
      contentType,
      size: fileBuffer.length
    });

    return publicUrl;
  } catch (error) {
    logger.error('Failed to upload file to R2', {
      error: error.message,
      stack: error.stack,
      sessionId,
      fileName
    });
    throw new Error(`R2 upload failed: ${error.message}`);
  }
}

/**
 * Delete a file from R2
 * @param {string} fileUrl - Public URL of the file to delete
 * @returns {Promise<boolean>} True if deleted successfully
 */
async function deleteFromR2(fileUrl) {
  try {
    // Extract key from public URL
    const key = fileUrl.replace(`${PUBLIC_URL}/`, '');

    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await r2Client.send(command);

    logger.info('File deleted from R2 successfully', {
      key,
      fileUrl
    });

    return true;
  } catch (error) {
    logger.error('Failed to delete file from R2', {
      error: error.message,
      fileUrl
    });
    return false;
  }
}

/**
 * Check if R2 is properly configured
 * @returns {boolean} True if all required env vars are set
 */
function isR2Configured() {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
}

module.exports = {
  uploadToR2,
  deleteFromR2,
  isR2Configured
};
