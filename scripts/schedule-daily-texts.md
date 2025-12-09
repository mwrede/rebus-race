# How to Schedule Daily Rank Messages

## Option 1: GitHub Actions (Free & Easy)

1. Create `.github/workflows/daily-text-blast.yml`:

```yaml
name: Daily Rank Text Blast

on:
  schedule:
    # Runs every day at 9:00 AM UTC (adjust time as needed)
    - cron: '0 9 * * *'
  workflow_dispatch: # Allows manual trigger

jobs:
  send-texts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install twilio @supabase/supabase-js dotenv
      
      - name: Send daily rank messages
        env:
          TWILIO_ACCOUNT_SID: ${{ secrets.TWILIO_ACCOUNT_SID }}
          TWILIO_AUTH_TOKEN: ${{ secrets.TWILIO_AUTH_TOKEN }}
          TWILIO_PHONE_NUMBER: ${{ secrets.TWILIO_PHONE_NUMBER }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: node scripts/send-daily-rank-message.js
```

2. Add secrets to GitHub:
   - Go to your repo → Settings → Secrets and variables → Actions
   - Add all the environment variables as secrets

3. The workflow will run daily automatically!

## Option 2: Vercel Cron Jobs

1. Create `api/cron-daily-texts.js`:

```javascript
export default async function handler(req, res) {
  // Verify it's a cron request (add auth header check)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Run the script logic here or import it
  // ... (copy logic from send-daily-rank-message.js)
  
  res.status(200).json({ success: true });
}
```

2. Add to `vercel.json`:

```json
{
  "crons": [{
    "path": "/api/cron-daily-texts",
    "schedule": "0 9 * * *"
  }]
}
```

## Option 3: External Cron Service (cron-job.org)

1. Sign up at https://cron-job.org (free)
2. Create a new cron job:
   - URL: Your API endpoint that runs the script
   - Schedule: Daily at your desired time
   - Method: POST
   - Add authentication header

## Option 4: Local Machine (for testing)

### Mac/Linux:
```bash
# Edit crontab
crontab -e

# Add this line (runs daily at 9 AM):
0 9 * * * cd /path/to/rebusle && node scripts/send-daily-rank-message.js >> /path/to/logs/daily-texts.log 2>&1
```

### Windows:
Use Task Scheduler to run the script daily.

## Testing

Before scheduling, test manually:

```bash
# Node.js
node scripts/send-daily-rank-message.js

# Python
python scripts/send-daily-rank-message-python.py
```

## Message Customization

Edit the message in the script:
- Node.js: Line with `const message = ...`
- Python: Line with `message = f"...`

## Important Notes

- **Rate Limits**: Twilio trial accounts have limits (~1 msg/sec). The script includes delays.
- **Costs**: Twilio charges per message after free trial. Check pricing.
- **Time Zone**: Adjust cron schedule to your preferred time zone.
- **Error Handling**: Script logs errors but continues sending to other users.


