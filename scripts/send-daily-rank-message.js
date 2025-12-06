// Daily Rank Message Sender using Twilio
// Sends personalized messages with each user's rank
// Run with: node scripts/send-daily-rank-message.js
//
// Setup:
// 1. Install: npm install twilio @supabase/supabase-js dotenv
// 2. Create .env file with your credentials (see text-blast-setup.md)
// 3. Schedule to run daily (see instructions below)

import dotenv from 'dotenv';
import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// Validate environment variables
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
if (!supabaseUrl) {
  console.error('Error: SUPABASE_URL or VITE_SUPABASE_URL is not set in .env file');
  process.exit(1);
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY is not set in .env file');
  process.exit(1);
}
if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
  console.error('Error: Twilio credentials are not set in .env file');
  process.exit(1);
}

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function sendDailyRankMessages() {
  // Get all users who have phone numbers and ranks
  const { data: users, error } = await supabase
    .from('users')
    .select('phone_number, username, all_time_rank, anon_id')
    .not('phone_number', 'is', null)
    .not('all_time_rank', 'is', null)
    .order('all_time_rank', { ascending: true });

  if (error) {
    console.error('Error fetching users:', error);
    return;
  }

  if (users.length === 0) {
    console.log('No users found to send messages to.');
    return;
  }

  console.log(`Sending daily rank messages to ${users.length} users...`);

  let successCount = 0;
  let failCount = 0;

  for (const user of users) {
    try {
      const username = user.username || 'Player';
      const rank = user.all_time_rank;
      
      const message = `You are ranked #${rank}, ${username}. Thank you for playing, and play Rebus Race again today! www.rebusrace.com`;
      
      await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: user.phone_number
      });
      
      console.log(`✓ Sent to ${username} (Rank #${rank}) - ${user.phone_number}`);
      successCount++;
      
      // Small delay to avoid rate limits (Twilio allows ~1 message/second on trial)
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      const username = user.username || user.anon_id;
      console.error(`✗ Failed to send to ${username}:`, error.message);
      failCount++;
    }
  }

  console.log(`\nComplete! Sent: ${successCount}, Failed: ${failCount}`);
}

sendDailyRankMessages().catch(console.error);

