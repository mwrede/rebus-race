# Daily Text Blast Setup Guide

## Step 1: Run the SQL Migrations

1. Run `add-phone-numbers-table.sql` in your Supabase SQL editor to create the users table
2. This will automatically migrate existing users from your submissions and guesses tables

## Step 2: Get List of All Users

Run `list-all-users.sql` to see all users in your database. This will show:
- anon_id (unique identifier)
- username
- total submissions
- correct submissions
- first and last played dates

## Step 3: Add Phone Numbers

You can add phone numbers in several ways:

### Option A: Manual Updates via SQL
Use `update-user-phone.sql` as a template to update individual users:
```sql
UPDATE users
SET phone_number = '+15551234567',
    phone_verified = true
WHERE anon_id = 'user_anon_id_here';
```

### Option B: Bulk Import via Supabase Dashboard
1. Export your users list from `list-all-users.sql`
2. Add phone numbers to the CSV
3. Import via Supabase Dashboard → Table Editor → users → Import

### Option C: Add Phone Number Collection in App
You could add a form in your app to let users enter their phone numbers.

## Step 4: Send Mass Texts

### Quick Start - Using the Scripts

I've created two scripts you can use to send mass texts:

**Option A: Node.js Script** (`send-mass-text.js`)
```bash
# Install dependencies
npm install twilio @supabase/supabase-js dotenv

# Create .env file with your credentials
# Then run:
node scripts/send-mass-text.js "Your message here"
```

**Option B: Python Script** (`send-mass-text-python.py`)
```bash
# Install dependencies
pip install twilio supabase python-dotenv

# Create .env file with your credentials
# Then run:
python scripts/send-mass-text-python.py "Your message here"
```

### Get Twilio Credentials

1. Sign up at https://www.twilio.com (free trial available)
2. Get your Account SID and Auth Token from the dashboard
3. Get a phone number (free trial includes one)
4. Add to `.env` file:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+1234567890
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

### Example Usage

```bash
# Send a daily puzzle reminder
node scripts/send-mass-text.js "New puzzle is live! Play now at yourwebsite.com"

# Send a special announcement
node scripts/send-mass-text.js "Big update: New features coming this week!"
```

## Step 5: Send Daily Rank Messages

### Quick Start

I've created scripts specifically for sending daily rank messages:

**Node.js**: `send-daily-rank-message.js`
**Python**: `send-daily-rank-message-python.py`

These scripts will:
- Get all users with verified phone numbers and ranks
- Send personalized message: "You are ranked #X, Username. Thank you for playing, and play Rebus Race again today! www.rebusrace.com"
- Handle errors gracefully

**Run manually:**
```bash
node scripts/send-daily-rank-message.js
```

**Schedule daily:** See `schedule-daily-texts.md` for detailed instructions on setting up automated daily runs.

## Step 6: Set Up Daily Text Blast (Generic)

### Option A: Use a Service like Twilio

1. Sign up for Twilio (https://www.twilio.com)
2. Get your Account SID and Auth Token
3. Create a serverless function (Vercel, Netlify, or Supabase Edge Function)

### Option B: Use Supabase Edge Functions

Create a Supabase Edge Function that:
1. Runs daily (via cron or external scheduler)
2. Queries users with `get-users-for-text-blast.sql`
3. Sends texts via Twilio API

### Example Edge Function Structure:

```typescript
// supabase/functions/daily-text-blast/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // Get users who opted in and have verified phone numbers
  const { data: users } = await supabase
    .from('users')
    .select('phone_number, username')
    .eq('opt_in_texts', true)
    .eq('phone_verified', true)
    .not('phone_number', 'is', null)

  // Send texts via Twilio
  for (const user of users) {
    // Twilio API call here
    // await sendText(user.phone_number, message)
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
```

## Step 5: Schedule the Daily Blast

- Use Vercel Cron Jobs
- Use GitHub Actions with scheduled workflows
- Use external services like cron-job.org
- Use Supabase Cron (if available)

## Phone Number Format

Store phone numbers in E.164 format: `+1234567890`
- Include country code
- No spaces, dashes, or parentheses
- Start with +

## User Opt-Out

Users can opt out by setting `opt_in_texts = false`:
```sql
UPDATE users
SET opt_in_texts = false
WHERE anon_id = 'user_anon_id_here';
```

