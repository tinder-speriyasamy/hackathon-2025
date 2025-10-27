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
const logger = require('./logger');
const aiMatchmaker = require('./ai-matchmaker');
const adminRoutes = require('./admin-routes');
const conversationManager = require('./conversation-manager');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Download and save media from Twilio
 * @param {string} mediaUrl - Twilio media URL
 * @param {string} contentType - Media content type
 * @returns {Promise<string>} Local file path
 */
async function downloadAndSaveMedia(mediaUrl, contentType) {
  const https = require('https');
  const url = require('url');

  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(mediaUrl);
    const ext = contentType.split('/')[1] || 'jpg';
    const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}.${ext}`;
    const filepath = path.join('uploads', filename);

    const file = fs.createWriteStream(filepath);

    https.get(mediaUrl, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        logger.info('Media saved', { filepath });
        resolve(`/uploads/${filename}`);
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
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
app.use('/uploads', express.static('uploads')); // Serve uploaded files
app.use(express.static('public')); // Serve static files from public directory

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

        // Download and save the media
        try {
          const savedPath = await downloadAndSaveMedia(mediaUrl, contentType);
          mediaUrls.push(savedPath);
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

      // Fallback: Send response to original sender via TwiML
      twiml.message(result.response);

      // Broadcast to all other participants in the session (async, don't wait)
      const senderPhone = req.body.From.replace('whatsapp:', '');
      const otherParticipants = result.participants.filter(p => p !== senderPhone);

      if (otherParticipants.length > 0) {
        logger.info('Broadcasting to other participants (manual fallback)', {
          sessionId: result.sessionId,
          otherParticipants: otherParticipants.length
        });

        // Send to other participants (don't await, fire and forget)
        otherParticipants.forEach(async (phoneNumber) => {
          try {
            await twilioClient.messages.create({
              from: process.env.TWILIO_WHATSAPP_NUMBER,
              to: `whatsapp:${phoneNumber}`,
              body: result.response
            });
            logger.debug('Broadcasted to participant', { phoneNumber, sessionId: result.sessionId });
          } catch (error) {
            logger.error('Failed to broadcast to participant', { phoneNumber, error: error.message });
          }
        });
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
