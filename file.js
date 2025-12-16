require('dotenv').config();
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();

// ==================== CONFIGURATION ====================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FACEBOOK_VERIFY_TOKEN = process.env.FACEBOOK_VERIFY_TOKEN;
const FACEBOOK_PAGE_ACCESS_TOKEN = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET;
const PORT = process.env.PORT || 5000;

// Initialize Gemini
const genai = new GoogleGenerativeAI(GEMINI_API_KEY);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== LOGGER ====================

const logger = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`),
  success: (msg) => console.log(`[✓] ${msg}`),
  warn: (msg) => console.warn(`[⚠] ${msg}`)
};

// ==================== WEBHOOK VERIFICATION ====================

app.get('/webhook', (req, res) => {
  /**
   * Facebook webhook verification endpoint.
   * Responds to initial webhook subscription request.
   */
  const verifyToken = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (verifyToken === FACEBOOK_VERIFY_TOKEN) {
    logger.success('Webhook verified successfully');
    return res.status(200).send(challenge);
  }

  logger.error('Webhook verification failed');
  return res.status(403).send('Invalid verification token');
});

// ==================== WEBHOOK RECEIVER ====================

app.post('/webhook', async (req, res) => {
  /**
   * Receives messages from Facebook and processes them with Gemini.
   */
  
  // Verify request signature
  if (!verifyRequestSignature(req)) {
    logger.error('Invalid request signature');
    return res.status(403).send('Unauthorized');
  }

  const body = req.body;
  logger.info(`Received webhook: ${JSON.stringify(body, null, 2)}`);

  // Process all entries
  if (body.object === 'page') {
    for (const entry of body.entry) {
      for (const messagingEvent of entry.messaging) {
        try {
          await processMessage(messagingEvent);
        } catch (error) {
          logger.error(`Error processing message: ${error.message}`);
        }
      }
    }
  }

  res.status(200).send('OK');
});

// ==================== MESSAGE PROCESSING ====================

async function processMessage(event) {
  /**
   * Processes incoming message and generates AI response.
   */
  const senderId = event.sender.id;
  const recipientId = event.recipient.id;

  // Handle incoming text messages
  if (event.message) {
    const messageData = event.message;
    const userMessage = messageData.text;

    if (userMessage) {
      logger.info(`Message from ${senderId}: ${userMessage}`);

      // Generate response using Gemini
      const aiResponse = await generateResponseWithGemini(userMessage);

      // Send response back to Facebook
      await sendMessageToFacebook(senderId, aiResponse);
    }
  }

  // Handle postbacks (button clicks)
  else if (event.postback) {
    const postbackPayload = event.postback.payload;
    logger.info(`Postback from ${senderId}: ${postbackPayload}`);
    
    // Handle specific postback actions
    await handlePostback(senderId, postbackPayload);
  }

  // Handle quick replies
  else if (event.message && event.message.quick_reply) {
    const quickReplyPayload = event.message.quick_reply.payload;
    logger.info(`Quick reply from ${senderId}: ${quickReplyPayload}`);
  }
}

// ==================== GEMINI AI INTEGRATION ====================

async function generateResponseWithGemini(userMessage) {
  /**
   * Sends user message to Gemini API and gets AI-generated response.
   */
  try {
    const model = genai.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = `You are a helpful customer service assistant for a Facebook business page.

User message: "${userMessage}"

Please provide a friendly, concise response (max 500 characters). 
If it's a question, answer helpfully. If it's a complaint, empathize and offer solutions.
Always be professional and courteous.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const aiText = response.text().trim();

    logger.success(`Gemini response: ${aiText}`);
    return aiText;
  } catch (error) {
    logger.error(`Error calling Gemini API: ${error.message}`);
    return 'Thank you for your message. I\'m having technical difficulties. Please try again later.';
  }
}

// ==================== POSTBACK HANDLER ====================

async function handlePostback(senderId, payload) {
  /**
   * Handle postback actions from button clicks
   */
  logger.info(`Processing postback: ${payload}`);

  const responses = {
    'GET_STARTED': 'Welcome! 👋 How can I help you today?',
    'MENU_INFO': 'Here\'s our business information...',
    'MENU_SUPPORT': 'Select an issue: 1) Billing 2) Technical 3) General',
  };

  const response = responses[payload] || 'I didn\'t understand that action.';
  await sendMessageToFacebook(senderId, response);
}

// ==================== FACEBOOK MESSAGING ====================

async function sendMessageToFacebook(recipientId, messageText) {
  /**
   * Sends generated response back to Facebook Messenger.
   */
  try {
    const url = `https://graph.facebook.com/v18.0/me/messages`;

    const payload = {
      recipient: {
        id: recipientId
      },
      message: {
        text: messageText
      },
      access_token: FACEBOOK_PAGE_ACCESS_TOKEN
    };

    const response = await axios.post(url, payload);

    if (response.status === 200) {
      logger.success(`Message sent to ${recipientId}`);
    }
  } catch (error) {
    logger.error(`Failed to send message to Facebook: ${error.message}`);
  }
}

// ==================== SECURITY ====================

function verifyRequestSignature(req) {
  /**
   * Verifies that the request came from Facebook using signature verification.
   */
  const xHubSignature = req.headers['x-hub-signature-256'];
  
  if (!xHubSignature) {
    return false;
  }

  const body = req.rawBody || JSON.stringify(req.body);
  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', FACEBOOK_APP_SECRET)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(xHubSignature),
    Buffer.from(expectedSignature)
  );
}

// ==================== HEALTH CHECK ====================

app.get('/health', (req, res) => {
  /**
   * Health check endpoint
   */
  res.status(200).json({
    status: 'running',
    timestamp: new Date().toISOString(),
    gemini_configured: !!GEMINI_API_KEY,
    facebook_configured: !!FACEBOOK_PAGE_ACCESS_TOKEN,
    environment: process.env.NODE_ENV || 'development'
  });
});

// ==================== ERROR HANDLERS ====================

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
});

// ==================== MIDDLEWARE FOR RAW BODY ====================

app.use(express.json({
  verify: (req, res, buf, encoding) => {
    req.rawBody = buf.toString(encoding || 'utf8');
  }
}));

// ==================== START SERVER ====================

app.listen(PORT, () => {
  logger.info('═══════════════════════════════════════════════');
  logger.info('Starting Facebook-Gemini Webhook Server');
  logger.info('═══════════════════════════════════════════════');
  logger.info(`✓ Listening on port ${PORT}`);
  logger.info(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info('═══════════════════════════════════════════════');
  
  // Log configuration status
  if (!GEMINI_API_KEY) logger.warn('GEMINI_API_KEY not configured');
  if (!FACEBOOK_PAGE_ACCESS_TOKEN) logger.warn('FACEBOOK_PAGE_ACCESS_TOKEN not configured');
  if (!FACEBOOK_VERIFY_TOKEN) logger.warn('FACEBOOK_VERIFY_TOKEN not configured');
});

module.exports = app;
