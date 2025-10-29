/**
 * Express server for Hackathon SMS Group Chat + Matchmaker
 *
 * This server handles:
 * - Twilio webhook endpoints for SMS/MMS
 * - Twilio Conversations API for group chats
 * - Health checks and connectivity tests
 *
 * @typedef {Object} TwilioMessage
 * @property {string} MessageSid - Unique message identifier
 * @property {string} From - Sender phone number
 * @property {string} To - Recipient phone number
 * @property {string} Body - Message body text
 */

require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('./src/utils/logger');
const { uploadToR2 } = require('./src/utils/r2-storage');
const aiMatchmaker = require('./src/core/ai-matchmaker');
const adminRoutes = require('./src/routes/admin-routes');
const conversationManager = require('./src/twilio/conversation-manager');
const profileUrlManager = require('./src/services/profile-url-manager');
const { generateInteractiveProfileHTML } = require('./src/services/profile-html-generator');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Download media from Twilio and upload to R2
 * @param {string} mediaUrl - Twilio media URL
 * @param {string} contentType - Media content type
 * @param {string} phoneNumber - Phone number for organizing files
 * @returns {Promise<string>} Public R2 URL
 */
async function downloadAndUploadToR2(mediaUrl, contentType, phoneNumber) {
  const https = require('https');

  return new Promise((resolve, reject) => {
    // Twilio media URLs require Basic Auth
    const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');

    const options = {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    };

    const downloadFile = (currentUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      https.get(currentUrl, options, (response) => {
        // Handle redirects (301, 302, 307, 308)
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          logger.debug('Following redirect', {
            from: currentUrl,
            to: response.headers.location,
            statusCode: response.statusCode
          });
          downloadFile(response.headers.location, redirectCount + 1);
          return;
        }

        // Check if response is successful
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download media: HTTP ${response.statusCode}`));
          return;
        }

        // Collect data chunks
        const chunks = [];
        response.on('data', (chunk) => {
          chunks.push(chunk);
        });

        response.on('end', async () => {
          try {
            const fileBuffer = Buffer.concat(chunks);
            const fileSize = fileBuffer.length;

            logger.info('Media downloaded from Twilio', {
              size: fileSize,
              contentType
            });

            if (fileSize < 1000) {
              logger.warn('Downloaded file is suspiciously small', { size: fileSize });
            }

            // Generate filename
            const ext = contentType.split('/')[1] || 'jpg';
            const filename = `photo.${ext}`;

            // Use phone number (cleaned) as session identifier
            const sessionId = phoneNumber.replace(/[^0-9]/g, '');

            // Upload to R2
            const publicUrl = await uploadToR2(fileBuffer, filename, contentType, sessionId);

            logger.info('Media uploaded to R2 successfully', {
              publicUrl,
              size: fileSize
            });

            resolve(publicUrl);
          } catch (error) {
            logger.error('Failed to upload media to R2', {
              error: error.message,
              stack: error.stack
            });
            reject(error);
          }
        });
      }).on('error', (err) => {
        reject(err);
      });
    };

    downloadFile(mediaUrl);
  });
}

/**
 * Split long messages into chunks that fit WhatsApp's character limit
 * @param {string} message - Message to split
 * @param {number} maxLength - Maximum length per message (default 1500 to leave room for formatting)
 * @returns {string[]} Array of message chunks
 */
function splitLongMessage(message, maxLength = 1500) {
  if (message.length <= maxLength) {
    return [message];
  }

  const chunks = [];
  let remaining = message;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a sentence boundary (., !, ?) within maxLength
    let splitIndex = maxLength;
    const sentenceEnd = remaining.lastIndexOf('. ', maxLength);
    const questionEnd = remaining.lastIndexOf('? ', maxLength);
    const exclamationEnd = remaining.lastIndexOf('! ', maxLength);

    const bestSplit = Math.max(sentenceEnd, questionEnd, exclamationEnd);
    if (bestSplit > maxLength * 0.7) {
      // If we found a good sentence boundary (at least 70% through)
      splitIndex = bestSplit + 1; // Include the punctuation
    } else {
      // Otherwise try to split at a word boundary
      const lastSpace = remaining.lastIndexOf(' ', maxLength);
      if (lastSpace > maxLength * 0.7) {
        splitIndex = lastSpace;
      }
    }

    chunks.push(remaining.substring(0, splitIndex).trim());
    remaining = remaining.substring(splitIndex).trim();
  }

  return chunks;
}

// Twilio credentials from environment
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
const TWILIO_WHATSAPP_NUMBER = process.env.TWILIO_WHATSAPP_NUMBER; // e.g., whatsapp:+14155238886
const TWILIO_CONVERSATIONS_SID = process.env.TWILIO_CONVERSATIONS_SID; // Conversations Service SID (starts with IS)

// Initialize Twilio client (only if credentials are set)
let twilioClient = null;
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  logger.info('Twilio client initialized');

  // Initialize Conversation Manager
  if (TWILIO_WHATSAPP_NUMBER) {
    conversationManager.initialize(twilioClient, TWILIO_WHATSAPP_NUMBER, TWILIO_CONVERSATIONS_SID);
  } else {
    logger.warn('TWILIO_WHATSAPP_NUMBER not set - Conversations API will not work');
  }
} else {
  logger.warn('Twilio credentials not set - some features will be disabled');
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Middleware
app.use(express.urlencoded({ extended: false })); // Parse URL-encoded bodies (Twilio sends this)
app.use(express.json()); // Parse JSON bodies
app.use(express.static('public')); // Serve static files from public directory
// Note: Profile card images are still stored locally in /uploads for now

// Admin routes
app.use('/admin', adminRoutes);

// Request logging middleware
app.use((req, res, next) => {
  logger.debug(`Incoming ${req.method} request`, {
    path: req.path,
    query: req.query,
    body: req.body
  });
  next();
});

/**
 * Serve web chat interface
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'chat.html'));
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Hackathon SMS Group Chat + Matchmaker Server',
    timestamp: new Date().toISOString(),
    twilioConfigured: !!twilioClient
  });
});

/**
 * Serve interactive profile page
 * GET /profile/:profileCode
 */
app.get('/profile/:profileCode', async (req, res) => {
  const { profileCode } = req.params;

  logger.info('Profile page requested', {
    profileCode,
    userAgent: req.get('user-agent'),
    ip: req.ip
  });

  try {
    // Retrieve profile data by unique code
    const profileData = await profileUrlManager.getProfileDataByCode(profileCode);

    if (!profileData) {
      logger.warn('Profile not found', { profileCode });
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Profile Not Found</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: #000;
              color: #fff;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              text-align: center;
              padding: 20px;
            }
            .container {
              max-width: 400px;
            }
            h1 {
              font-size: 48px;
              margin-bottom: 16px;
            }
            p {
              font-size: 18px;
              color: rgba(255, 255, 255, 0.7);
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>404</h1>
            <p>Profile not found. It may have been deleted or the link is incorrect.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Get all photos from session data (if available)
    const allPhotos = profileData.photos || [];

    logger.info('Rendering profile page', {
      profileCode,
      profileName: profileData.name,
      photoCount: allPhotos.length
    });

    // Generate interactive HTML
    const html = generateInteractiveProfileHTML(profileData, allPhotos);

    // Send HTML response
    res.type('text/html');
    res.send(html);

  } catch (error) {
    logger.error('Failed to serve profile page', {
      profileCode,
      error: error.message,
      stack: error.stack
    });

    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Error</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #000;
            color: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            text-align: center;
            padding: 20px;
          }
          .container {
            max-width: 400px;
          }
          h1 {
            font-size: 48px;
            margin-bottom: 16px;
          }
          p {
            font-size: 18px;
            color: rgba(255, 255, 255, 0.7);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Error</h1>
          <p>Something went wrong loading this profile. Please try again later.</p>
        </div>
      </body>
      </html>
    `);
  }
});

/**
 * Connectivity check endpoint - verify Twilio configuration
 */
app.get('/api/check-twilio', async (req, res) => {
  logger.info('Running Twilio connectivity check');

  if (!twilioClient) {
    logger.error('Twilio client not initialized');
    return res.status(500).json({
      success: false,
      error: 'Twilio credentials not configured'
    });
  }

  try {
    // Check account details
    const account = await twilioClient.api.accounts(TWILIO_ACCOUNT_SID).fetch();
    logger.info('Account fetched successfully', {
      friendlyName: account.friendlyName,
      status: account.status
    });

    // List phone numbers
    const phoneNumbers = await twilioClient.incomingPhoneNumbers.list({ limit: 10 });
    logger.info(`Found ${phoneNumbers.length} phone number(s)`, {
      numbers: phoneNumbers.map(num => ({
        phoneNumber: num.phoneNumber,
        friendlyName: num.friendlyName,
        capabilities: num.capabilities
      }))
    });

    // Check for WhatsApp senders
    let whatsappSenders = [];
    try {
      // Try to get messaging service (often used with WhatsApp)
      const messagingServices = await twilioClient.messaging.v1.services.list({ limit: 10 });
      whatsappSenders = messagingServices;
      logger.info(`Found ${messagingServices.length} messaging service(s)`);
    } catch (err) {
      logger.warn('Could not fetch messaging services', err.message);
    }

    res.json({
      success: true,
      account: {
        friendlyName: account.friendlyName,
        status: account.status
      },
      phoneNumbers: phoneNumbers.map(num => ({
        phoneNumber: num.phoneNumber,
        friendlyName: num.friendlyName,
        capabilities: num.capabilities
      })),
      whatsappSenders: whatsappSenders.map(s => ({
        sid: s.sid,
        friendlyName: s.friendlyName
      }))
    });
  } catch (error) {
    logger.error('Twilio connectivity check failed', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Webhook endpoint for incoming SMS/MMS/WhatsApp messages
 * Twilio will POST to this endpoint when a message is received
 */
app.post('/webhooks/sms', async (req, res) => {
  const isWhatsApp = req.body.From && req.body.From.startsWith('whatsapp:');
  const numMedia = parseInt(req.body.NumMedia) || 0;

  // Handle media (photos) from WhatsApp
  const mediaUrls = [];
  if (numMedia > 0) {
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = req.body[`MediaUrl${i}`];
      const contentType = req.body[`MediaContentType${i}`];

      if (mediaUrl) {
        logger.info('Received media from WhatsApp', {
          url: mediaUrl,
          contentType: contentType
        });

        // Download and upload media to R2
        try {
          const publicUrl = await downloadAndUploadToR2(mediaUrl, contentType, req.body.From);
          mediaUrls.push(publicUrl);
        } catch (error) {
          logger.error('Failed to download media', error);
        }
      }
    }
  }

  logger.info(`Received ${isWhatsApp ? 'WhatsApp' : 'SMS'} webhook`, {
    from: req.body.From,
    to: req.body.To,
    body: req.body.Body,
    messageSid: req.body.MessageSid,
    profileName: req.body.ProfileName,
    numMedia: numMedia,
    mediaUrls: mediaUrls
  });

  // Create TwiML response
  const twiml = new twilio.twiml.MessagingResponse();

  // For WhatsApp, use AI matchmaker
  if (isWhatsApp) {
    try {
      const result = await aiMatchmaker.handleMessage(
        req.body.From,
        req.body.Body || '📷 [Photo sent]',
        req.body.ProfileName,
        mediaUrls
      );

      logger.info('AI matchmaker response generated', {
        from: req.body.From,
        sessionId: result.sessionId,
        responseLength: result.response.length,
        participantCount: result.participants.length,
        sentViaConversations: result.sentViaConversations || false
      });

      // Broadcast user's message to other participants with sender name
      const senderPhone = req.body.From.replace('whatsapp:', '');
      const senderName = req.body.ProfileName || senderPhone;
      const userMessage = req.body.Body || (numMedia > 0 ? '📷 [Photo sent]' : '');
      const otherParticipants = result.participants.filter(p => p !== senderPhone);

      if (otherParticipants.length > 0) {
        const broadcastStartTime = Date.now();
        logger.info('Broadcasting user message to other participants', {
          sessionId: result.sessionId,
          sender: senderName,
          otherParticipants: otherParticipants.length,
          hasMedia: numMedia > 0
        });

        // Format message with sender name
        const formattedUserMessage = userMessage ? `*${senderName}:* ${userMessage}` : `*${senderName}:*`;

        // Broadcast to other participants and WAIT for all to complete before sending AI response
        const broadcastPromises = otherParticipants.map(async (phoneNumber) => {
          try {
            const messageOptions = {
              from: process.env.TWILIO_WHATSAPP_NUMBER,
              to: `whatsapp:${phoneNumber}`,
              body: formattedUserMessage
            };

            // Include media URLs if present (R2 URLs)
            if (numMedia > 0 && mediaUrls.length > 0) {
              messageOptions.mediaUrl = mediaUrls;
              logger.debug('Adding media URLs to broadcast', { mediaUrls });
            }

            await twilioClient.messages.create(messageOptions);
            logger.debug('Broadcasted user message to participant', {
              phoneNumber,
              sender: senderName,
              mediaCount: numMedia
            });
          } catch (error) {
            logger.error('Failed to broadcast user message', { phoneNumber, error: error.message });
          }
        });

        // Wait for ALL user message broadcasts to complete
        await Promise.all(broadcastPromises);

        const broadcastDuration = Date.now() - broadcastStartTime;
        logger.info('✅ User message broadcast complete', {
          sessionId: result.sessionId,
          duration: `${broadcastDuration}ms`,
          participantCount: otherParticipants.length
        });
      }

      // If message was already sent via Conversations API, just acknowledge
      if (result.sentViaConversations) {
        logger.info('Message already sent via Conversations API, skipping manual broadcast', {
          sessionId: result.sessionId
        });
        // Send empty TwiML response (no duplicate message to sender)
        res.type('text/xml');
        res.send(twiml.toString());
        return;
      }

      // Format AI response with mchd prefix for clarity
      const formattedAIResponse = `*mchd:* ${result.response}`;

      // Split long messages to fit WhatsApp's 1600 character limit
      const messageChunks = splitLongMessage(formattedAIResponse);

      logger.info('Broadcasting AI response to all participants', {
        sessionId: result.sessionId,
        participantCount: result.participants.length,
        messageLength: formattedAIResponse.length,
        chunks: messageChunks.length,
        senderPhone: senderPhone
      });

      // Send all chunks to all participants via API (simpler and more reliable than TwiML split)
      for (const phoneNumber of result.participants) {
        try {
          logger.debug('Sending AI response to participant', {
            phoneNumber,
            senderPhone,
            isSender: phoneNumber === senderPhone,
            sessionId: result.sessionId,
            chunksToSend: messageChunks.length
          });

          // Send all message chunks
          for (let i = 0; i < messageChunks.length; i++) {
            await twilioClient.messages.create({
              from: process.env.TWILIO_WHATSAPP_NUMBER,
              to: `whatsapp:${phoneNumber}`,
              body: messageChunks[i]
            });

            logger.debug('Sent AI response chunk', {
              phoneNumber,
              sessionId: result.sessionId,
              chunk: i + 1,
              totalChunks: messageChunks.length
            });
          }

          // Send profile URL if available (after all text chunks)
          if (result.profileUrl) {
            await twilioClient.messages.create({
              from: process.env.TWILIO_WHATSAPP_NUMBER,
              to: `whatsapp:${phoneNumber}`,
              body: `✨ Your profile is ready! Check it out:\n${result.profileUrl}`
            });

            logger.info('Sent profile URL', {
              phoneNumber,
              sessionId: result.sessionId,
              profileUrl: result.profileUrl
            });
          }
        } catch (error) {
          logger.error('Failed to broadcast AI response', {
            phoneNumber,
            sessionId: result.sessionId,
            error: error.message
          });
        }
      }

    } catch (error) {
      logger.error('Error processing AI response', error);
      twiml.message('Sorry, I had a little hiccup! Can you try that again?');
    }
  } else {
    // SMS fallback
    twiml.message('Thanks for your message! This is a test response from the hackathon server.');
  }

  res.type('text/xml');
  res.send(twiml.toString());
});

/**
 * Test endpoint to send an SMS
 * Use this to test outbound messaging
 */
app.post('/api/send-sms', async (req, res) => {
  const { to, body } = req.body;

  logger.info('Sending test SMS', { to, body });

  if (!twilioClient) {
    logger.error('Twilio client not initialized');
    return res.status(500).json({
      success: false,
      error: 'Twilio credentials not configured'
    });
  }

  if (!to || !body) {
    logger.warn('Missing required fields', { to, body });
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: to, body'
    });
  }

  try {
    const message = await twilioClient.messages.create({
      body: body,
      from: TWILIO_PHONE_NUMBER,
      to: to
    });

    logger.info('SMS sent successfully', {
      messageSid: message.sid,
      status: message.status
    });

    res.json({
      success: true,
      messageSid: message.sid,
      status: message.status
    });
  } catch (error) {
    logger.error('Failed to send SMS', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Send WhatsApp message
 * Use this to test WhatsApp messaging
 */
app.post('/api/send-whatsapp', async (req, res) => {
  const { to, body } = req.body;

  logger.info('Sending WhatsApp message', { to, body });

  if (!twilioClient) {
    return res.status(500).json({ success: false, error: 'Twilio not configured' });
  }

  if (!TWILIO_WHATSAPP_NUMBER) {
    return res.status(500).json({
      success: false,
      error: 'TWILIO_WHATSAPP_NUMBER not configured in .env'
    });
  }

  if (!to || !body) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: to, body'
    });
  }

  // Ensure 'to' number has 'whatsapp:' prefix
  const toNumber = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  try {
    const message = await twilioClient.messages.create({
      body: body,
      from: TWILIO_WHATSAPP_NUMBER,
      to: toNumber
    });

    logger.info('WhatsApp message sent successfully', {
      messageSid: message.sid,
      status: message.status,
      to: toNumber
    });

    res.json({
      success: true,
      messageSid: message.sid,
      status: message.status,
      to: toNumber
    });
  } catch (error) {
    logger.error('Failed to send WhatsApp message', error);
    res.json({
      success: false,
      error: error.message,
      hint: 'Make sure: 1) WhatsApp number is configured, 2) Recipient has messaged your WhatsApp Business number first (for sandbox), 3) Number format is whatsapp:+1XXXXXXXXXX'
    });
  }
});

/**
 * List Twilio Conversations
 */
app.get('/api/conversations', async (req, res) => {
  logger.info('Fetching conversations list');

  if (!twilioClient) {
    return res.status(500).json({ success: false, error: 'Twilio not configured' });
  }

  try {
    const conversations = await twilioClient.conversations.v1.conversations.list({ limit: 20 });

    logger.info(`Found ${conversations.length} conversation(s)`, {
      conversations: conversations.map(c => ({
        sid: c.sid,
        friendlyName: c.friendlyName,
        state: c.state
      }))
    });

    res.json({
      success: true,
      conversations: conversations.map(c => ({
        sid: c.sid,
        friendlyName: c.friendlyName,
        state: c.state,
        dateCreated: c.dateCreated
      }))
    });
  } catch (error) {
    logger.error('Failed to fetch conversations', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Create a new Twilio Conversation (group chat)
 */
app.post('/api/conversations/create', async (req, res) => {
  const { friendlyName, participants } = req.body;

  logger.info('Creating new conversation', { friendlyName, participants });

  if (!twilioClient) {
    return res.status(500).json({ success: false, error: 'Twilio not configured' });
  }

  try {
    // Create the conversation
    const conversation = await twilioClient.conversations.v1.conversations.create({
      friendlyName: friendlyName || 'Group Chat'
    });

    logger.info('Conversation created', {
      sid: conversation.sid,
      friendlyName: conversation.friendlyName
    });

    // Add participants if provided
    if (participants && Array.isArray(participants)) {
      for (const phoneNumber of participants) {
        try {
          await twilioClient.conversations.v1
            .conversations(conversation.sid)
            .participants.create({
              'messagingBinding.address': phoneNumber,
              'messagingBinding.proxyAddress': TWILIO_PHONE_NUMBER
            });

          logger.info('Added participant', {
            conversationSid: conversation.sid,
            phoneNumber
          });
        } catch (error) {
          logger.error('Failed to add participant', {
            phoneNumber,
            error: error.message
          });
        }
      }
    }

    res.json({
      success: true,
      conversation: {
        sid: conversation.sid,
        friendlyName: conversation.friendlyName
      }
    });
  } catch (error) {
    logger.error('Failed to create conversation', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Send a message to a conversation
 */
app.post('/api/conversations/:sid/message', async (req, res) => {
  const { sid } = req.params;
  const { body } = req.body;

  logger.info('Sending message to conversation', { sid, body });

  if (!twilioClient) {
    return res.status(500).json({ success: false, error: 'Twilio not configured' });
  }

  try {
    const message = await twilioClient.conversations.v1
      .conversations(sid)
      .messages.create({ body });

    logger.info('Message sent to conversation', {
      messageSid: message.sid,
      conversationSid: sid
    });

    res.json({
      success: true,
      message: {
        sid: message.sid,
        body: message.body
      }
    });
  } catch (error) {
    logger.error('Failed to send message to conversation', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * List verified phone numbers (Outgoing Caller IDs)
 */
app.get('/api/verified-numbers', async (req, res) => {
  logger.info('Fetching verified phone numbers');

  if (!twilioClient) {
    return res.status(500).json({ success: false, error: 'Twilio not configured' });
  }

  try {
    // List verified outgoing caller IDs
    const outgoingCallerIds = await twilioClient.outgoingCallerIds.list({ limit: 50 });

    logger.info(`Found ${outgoingCallerIds.length} verified number(s)`, {
      numbers: outgoingCallerIds.map(id => ({
        phoneNumber: id.phoneNumber,
        friendlyName: id.friendlyName
      }))
    });

    res.json({
      success: true,
      verifiedNumbers: outgoingCallerIds.map(id => ({
        sid: id.sid,
        phoneNumber: id.phoneNumber,
        friendlyName: id.friendlyName,
        dateCreated: id.dateCreated
      }))
    });
  } catch (error) {
    logger.error('Failed to fetch verified numbers', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Start phone number verification
 * Can use either SMS or voice call
 */
app.post('/api/verify-number/start', async (req, res) => {
  const { phoneNumber, friendlyName, method } = req.body;
  const verificationMethod = method || 'sms'; // Default to SMS

  logger.info('Starting phone verification', { phoneNumber, friendlyName, method: verificationMethod });

  if (!twilioClient) {
    return res.status(500).json({ success: false, error: 'Twilio not configured' });
  }

  if (!phoneNumber) {
    return res.status(400).json({
      success: false,
      error: 'Missing required field: phoneNumber'
    });
  }

  try {
    // Note: Twilio's validationRequests API only supports voice calls
    // For SMS-based verification, we need to use the Verify API
    // But for trial accounts and Outgoing Caller IDs, we'll use voice

    if (verificationMethod === 'sms') {
      // For SMS, we'll use Twilio Verify API
      logger.info('Using Twilio Verify API for SMS verification');

      const verification = await twilioClient.verify.v2
        .services(process.env.TWILIO_VERIFY_SERVICE_SID || 'default')
        .verifications
        .create({ to: phoneNumber, channel: 'sms' });

      logger.info('SMS verification sent', {
        phoneNumber: verification.to,
        status: verification.status
      });

      res.json({
        success: true,
        method: 'sms',
        message: 'Verification code sent via SMS',
        phoneNumber: verification.to,
        status: verification.status,
        instructions: [
          '1. Check your phone for SMS from Twilio',
          '2. Copy the verification code',
          '3. Use the /api/verify-number/check endpoint to verify the code'
        ],
        nextStep: 'POST /api/verify-number/check with { phoneNumber, code }'
      });
    } else {
      // Use voice call method (original)
      const validationRequest = await twilioClient.validationRequests.create({
        phoneNumber: phoneNumber,
        friendlyName: friendlyName || phoneNumber,
        callDelay: 0
      });

      logger.info('Verification started - Twilio will call with code', {
        phoneNumber: validationRequest.phoneNumber,
        validationCode: validationRequest.validationCode
      });

      res.json({
        success: true,
        method: 'call',
        message: 'Twilio will call this number. Answer and enter the 6-digit code shown below when prompted.',
        phoneNumber: validationRequest.phoneNumber,
        validationCode: validationRequest.validationCode,
        instructions: [
          '1. Answer the call from Twilio',
          '2. When prompted, enter this code: ' + validationRequest.validationCode,
          '3. The number will be verified immediately'
        ]
      });
    }
  } catch (error) {
    logger.error('Failed to start verification', error);
    res.status(500).json({
      success: false,
      error: error.message,
      hint: 'Make sure the phone number is in E.164 format (e.g., +19193087138)',
      details: error.moreInfo || 'No additional details'
    });
  }
});

/**
 * Test AI matchmaker directly (without WhatsApp)
 */
app.post('/api/test-ai', async (req, res) => {
  const { phoneNumber, message } = req.body;

  logger.info('Testing AI matchmaker', { phoneNumber, message });

  if (!phoneNumber || !message) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: phoneNumber, message'
    });
  }

  try {
    const result = await aiMatchmaker.handleMessage(
      `whatsapp:${phoneNumber}`,
      message,
      'Test User'
    );

    res.json({
      success: true,
      response: result.response,
      sessionId: result.sessionId,
      participants: result.participants,
      conversationState: aiMatchmaker.getState(phoneNumber)
    });
  } catch (error) {
    logger.error('AI test failed', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get conversation state for debugging
 */
app.get('/api/conversation/:phoneNumber', (req, res) => {
  const phoneNumber = req.params.phoneNumber.replace('whatsapp:', '');
  const state = aiMatchmaker.getState(phoneNumber);

  if (!state) {
    return res.status(404).json({
      success: false,
      error: 'No conversation found for this number'
    });
  }

  res.json({
    success: true,
    state
  });
});

/**
 * Reset conversation (for testing)
 */
app.post('/api/conversation/:phoneNumber/reset', (req, res) => {
  const phoneNumber = req.params.phoneNumber.replace('whatsapp:', '');
  aiMatchmaker.resetConversation(phoneNumber);

  logger.info('Conversation reset', { phoneNumber });

  res.json({
    success: true,
    message: 'Conversation reset successfully'
  });
});

/**
 * Upload photo
 */
app.post('/api/upload-photo', upload.single('photo'), (req, res) => {
  logger.info('Photo uploaded', {
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype
  });

  res.json({
    success: true,
    filename: req.file.filename,
    url: `/uploads/${req.file.filename}`
  });
});

/**
 * Send message with photo to conversation
 */
app.post('/api/send-message', async (req, res) => {
  const { phoneNumber, message, photoUrl } = req.body;

  logger.info('Sending message', { phoneNumber, message, photoUrl });

  if (!phoneNumber || !message) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: phoneNumber, message'
    });
  }

  try {
    // Handle message with AI (pass photo as array to match WhatsApp format)
    const mediaUrls = photoUrl ? [photoUrl] : [];
    const result = await aiMatchmaker.handleMessage(
      `whatsapp:${phoneNumber}`,
      message,
      'Web User',
      mediaUrls
    );

    res.json({
      success: true,
      userMessage: { message, photoUrl, timestamp: new Date().toISOString() },
      aiResponse: { message: result.response, timestamp: new Date().toISOString() },
      sessionId: result.sessionId,
      participants: result.participants,
      conversationState: aiMatchmaker.getState(phoneNumber)
    });
  } catch (error) {
    logger.error('Failed to send message', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Webhook for Twilio Conversations API events
 * This handles all conversation events (message added, participant added, etc.)
 */
app.post('/webhooks/conversations', async (req, res) => {
  const eventType = req.body.EventType;
  const conversationSid = req.body.ConversationSid;
  const author = req.body.Author; // Phone number or identity
  const messageBody = req.body.Body;
  const messageSid = req.body.MessageSid;

  logger.info('Received Conversations webhook', {
    eventType,
    conversationSid,
    author,
    messageSid,
    bodyPreview: messageBody ? messageBody.substring(0, 50) : null
  });

  // Only process message events for logging/debugging
  if (eventType === 'onMessageAdded') {
    // Log all messages but don't process them
    // We process messages through /webhooks/sms instead to avoid duplicates
    logger.info('Conversation message logged', {
      conversationSid,
      author,
      messageSid,
      bodyPreview: messageBody?.substring(0, 100)
    });

    // All message processing happens through /webhooks/sms
    // This webhook is just for visibility/debugging
    res.sendStatus(200);
  } else {
    // Other event types (onParticipantAdded, etc.)
    logger.debug('Non-message Conversations event', { eventType, conversationSid });
    res.sendStatus(200);
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server started successfully`, {
    port: PORT,
    url: `http://localhost:${PORT}`,
    twilioConfigured: !!twilioClient
  });

  if (!twilioClient) {
    logger.warn('To enable Twilio features, create a .env file with:');
    logger.warn('TWILIO_ACCOUNT_SID=your_account_sid');
    logger.warn('TWILIO_AUTH_TOKEN=your_auth_token');
    logger.warn('TWILIO_PHONE_NUMBER=your_twilio_phone_number');
  }
});
