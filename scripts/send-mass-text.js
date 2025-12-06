// Mass Text Sender using Twilio
// Run this with: node scripts/send-mass-text.js "Your message here"
// 
// Setup:
// 1. Install: npm install twilio @supabase/supabase-js dotenv
// 2. Create .env file with:
//    TWILIO_ACCOUNT_SID=your_account_sid
//    TWILIO_AUTH_TOKEN=your_auth_token
//    TWILIO_PHONE_NUMBER=+1234567890
//    SUPABASE_URL=your_supabase_url
//    SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

require('dotenv').config();
const twilio = require('twilio');
const { createClient } = require('@supabase/supabase-js');

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function sendMassText(message) {
  // Get all users who opted in and have verified phone numbers
  const { data: users, error } = await supabase
    .from('users')
    .select('phone_number, username, anon_id')
    .eq('opt_in_texts', true)
    .eq('phone_verified', true)
    .not('phone_number', 'is', null);

  if (error) {
    console.error('Error fetching users:', error);
    return;
  }

  console.log(`Sending text to ${users.length} users...`);

  let successCount = 0;
  let failCount = 0;

  for (const user of users) {
    try {
      await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: user.phone_number
      });
      console.log(`✓ Sent to ${user.username || user.anon_id} (${user.phone_number})`);
      successCount++;
      
      // Small delay to avoid rate limits (Twilio allows ~1 message/second on trial)
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`✗ Failed to send to ${user.username || user.anon_id}:`, error.message);
      failCount++;
    }
  }

  console.log(`\nComplete! Sent: ${successCount}, Failed: ${failCount}`);
}

// Get message from command line argument
const message = process.argv[2];

if (!message) {
  console.error('Please provide a message: node scripts/send-mass-text.js "Your message here"');
  process.exit(1);
}

sendMassText(message).catch(console.error);

