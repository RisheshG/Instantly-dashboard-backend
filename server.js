const express = require('express');
const axios = require('axios');
const cors = require('cors');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 5001;

// Initialize Firebase Admin SDK
const serviceAccount = require('/Users/risheshgangwar/Instantly dashboard front + backend/instantly-dashboard-firebase-adminsdk-fbsvc-3c37b82e50.json'); // Replace with your service account file path

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Configure CORS to allow requests from your frontend
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // Allow all domains
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

const API_KEY = 'MWYzODNlMWYtYmM4YS00YjQ5LWExMDUtNzQ0MmZkMmRiODJhOkVqREpJSldjSFZuYQ==';
const JWT_SECRET = 'your-secret-key'; // Replace with a secure secret key

// Middleware to verify JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401); // Unauthorized if no token

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403); // Forbidden if token is invalid
    req.user = user; // Attach the user payload to the request object
    next();
  });
};

// Endpoint to register a new user
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
    });

    console.log('Successfully created new user:', userRecord.uid);
    res.status(201).json({ message: 'User registered successfully', uid: userRecord.uid });
  } catch (error) {
    console.error('Error creating new user:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// Endpoint to login a user
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const userRecord = await admin.auth().getUserByEmail(email);

    // In a real-world scenario, you would verify the password here using Firebase Authentication
    // For simplicity, we assume the password is correct and return a success response

    // Generate a JWT token
    const token = jwt.sign({ uid: userRecord.uid, email: userRecord.email }, JWT_SECRET, { expiresIn: '1h' });

    console.log('User logged in successfully:', userRecord.uid);
    res.status(200).json({ message: 'User logged in successfully', uid: userRecord.uid, token });
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(401).json({ error: 'Invalid email or password' });
  }
});

// Endpoint to fetch all campaigns (protected route)
app.get('/api/campaigns', authenticateToken, async (req, res) => {
  try {
    const response = await axios.get('https://api.instantly.ai/api/v2/campaigns/analytics', {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    });

    console.log('Fetched Campaigns Data:', response.data); // Log raw data

    // Ensure the frontend gets properly structured data
    const campaigns = response.data.map((campaign) => ({
      id: campaign.campaign_id, // Correct key name
      name: campaign.campaign_name,
      leads: campaign.leads_count,
      contacted: campaign.contacted_count,
      open: campaign.open_count,
      reply: campaign.reply_count,
      bounced: campaign.bounced_count,
      unsubscribed: campaign.unsubscribed_count,
      completed: campaign.completed_count,
      sent: campaign.emails_sent_count,
      opportunities: campaign.total_opportunities,
      opportunity_value: campaign.total_opportunity_value,
    }));

    console.log('Formatted Campaigns Data Sent to Frontend:', campaigns);
    res.json(campaigns);
  } catch (error) {
    console.error('Failed to fetch campaigns:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Endpoint to fetch campaign analytics (protected route)
app.get('/api/campaigns/analytics', authenticateToken, async (req, res) => {
  const { id, start_date, end_date } = req.query;
  console.log(`Fetching analytics for Campaign ID: ${id}, Start Date: ${start_date}, End Date: ${end_date}`);

  try {
    // Fetch campaign analytics with date parameters
    const response = await axios.get(
      `https://api.instantly.ai/api/v2/campaigns/analytics?end_date=${end_date}&id=${id}&start_date=${start_date}`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
        },
      }
    );

    // Fetch campaign analytics WITHOUT date parameters to get open rate
    const openRateResponse = await axios.get(`https://api.instantly.ai/api/v2/campaigns/analytics?id=${id}`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    });

    const formattedData = response.data.map((campaign) => {
      // Find the corresponding campaign in the open rate response
      const openRateCampaign = openRateResponse.data.find((c) => c.campaign_id === campaign.campaign_id);

      // Calculate Open Rate using data without date parameters
      const openRate = openRateCampaign
        ? (openRateCampaign.open_count / openRateCampaign.contacted_count) * 100 || 0
        : 0;

      return {
        'Campaign Name': campaign.campaign_name,
        'Campaign ID': campaign.campaign_id,
        'Leads Count': campaign.leads_count,
        'Contacted Count': campaign.contacted_count,
        'Open Count': campaign.open_count,
        'Reply Count': campaign.reply_count,
        'Bounced Count': campaign.bounced_count,
        'Unsubscribed Count': campaign.unsubscribed_count,
        'Completed Count': campaign.completed_count,
        'Emails Sent Count': campaign.emails_sent_count,
        'New Leads Contacted Count': campaign.new_leads_contacted_count,
        'Open Rate (%)': openRate.toFixed(2),
      };
    });

    console.log('Formatted Analytics Data:', formattedData);
    res.json(formattedData);
  } catch (error) {
    console.error('Failed to fetch campaign analytics:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch campaign analytics' });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
