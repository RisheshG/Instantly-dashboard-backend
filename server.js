const express = require('express');
const axios = require('axios');
const cors = require('cors');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');

const app = express();
const PORT = 5001;

// Initialize Firebase Admin SDK
const serviceAccount = require('./instantly-dashboard-firebase-adminsdk-fbsvc-3c37b82e50.json'); // Replace with your service account file path

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

// Middleware to verify Firebase ID token
const verifyToken = async (req, res, next) => {
  const idToken = req.headers.authorization?.split('Bearer ')[1]; // Extract token from Authorization header

  if (!idToken) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken; // Attach the decoded user information to the request object
    next();
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

// Function to fetch campaign details
const fetchCampaignDetails = async (campaignId) => {
  try {
    const response = await axios.get(`https://api.instantly.ai/api/v2/campaigns?limit=10&starting_after=${campaignId}`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    });

    // Check if the response contains the campaigns array
    if (response.data && Array.isArray(response.data.campaigns)) {
      const campaign = response.data.campaigns.find((c) => c.id === campaignId);
      return campaign ? { status: campaign.status, email_list: campaign.email_list } : null;
    } else {
      console.error('Unexpected API response structure:', response.data);
      return null;
    }
  } catch (error) {
    console.error('Failed to fetch campaign details:', error.response?.data || error.message);
    return null;
  }
};

// Endpoint to fetch all campaigns (protected by token verification)
app.get('/api/campaigns', async (req, res) => {
  try {
    const response = await axios.get('https://api.instantly.ai/api/v2/campaigns/analytics', {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    });

    console.log('Fetched Campaigns Data:', response.data); // Log raw data

    // Ensure the frontend gets properly structured data
    const campaigns = await Promise.all(
      response.data.map(async (campaign) => {
        const details = await fetchCampaignDetails(campaign.campaign_id);
        return {
          id: campaign.campaign_id, // Correct key name
          name: campaign.campaign_name,
          status: details ? details.status : undefined, // Add status
          email_list: details ? details.email_list : undefined, // Add mailboxes associated
        };
      })
    );

    console.log('Formatted Campaigns Data Sent to Frontend:', campaigns);
    res.json(campaigns);
  } catch (error) {
    console.error('Failed to fetch campaigns:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// Endpoint to fetch campaign analytics (protected by token verification)
app.get('/api/campaigns/analytics', verifyToken, async (req, res) => {
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

    // Fetch campaign analytics WITHOUT date parameters to get open rate and campaign details
    const openRateResponse = await axios.get(`https://api.instantly.ai/api/v2/campaigns/analytics?id=${id}`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    });

    const campaignData = response.data[0]; // Assuming the response contains only one campaign
    const openRateData = openRateResponse.data[0]; // Assuming the response contains only one campaign

    // Calculate Open Rate using data without date parameters
    const openRate = (openRateData.open_count / openRateData.contacted_count) * 100 || 0;

    // Calculate Delivered Emails
    const delivered = campaignData.emails_sent_count - campaignData.bounced_count;

    // Calculate Reply Rate
    const replyRate = (campaignData.reply_count / campaignData.emails_sent_count) * 100 || 0;

    // Calculate Bounce Rate
    const bounceRate = (campaignData.bounced_count / campaignData.emails_sent_count) * 100 || 0;

    // Fetch campaign details from the openRateResponse
    const campaignDetails = {
      status: openRateData.campaign_status,
      email_list: openRateData.email_list,
    };

    // Format the data to be sent to the frontend
    const formattedData = {
      Date: `${start_date} to ${end_date}`,
      'Campaign Name': campaignData.campaign_name,
      'Campaign Status': campaignDetails.status,
      'Mailboxes Associated': campaignDetails.email_list,
      'New Prospects Contacted': campaignData.new_leads_contacted_count,
      'Total Emails Sent': campaignData.emails_sent_count,
      'Delivered': delivered,
      'Mails Opened': campaignData.open_count,
      'Open Rate (%)': openRate.toFixed(2),
      'Responded': campaignData.reply_count,
      'Reply Rate (%)': replyRate.toFixed(2),
      'Bounced': campaignData.bounced_count,
      'Bounce Rate (%)': bounceRate.toFixed(2),
    };

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
