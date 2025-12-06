#!/usr/bin/env python3
"""
Daily Rank Message Sender using Twilio (Python version)
Sends personalized messages with each user's rank
Run with: python scripts/send-daily-rank-message-python.py

Setup:
1. Install: pip install twilio supabase python-dotenv
2. Create .env file with your credentials (see text-blast-setup.md)
3. Schedule to run daily (see instructions below)
"""

import os
import time
from dotenv import load_dotenv
from twilio.rest import Client
from supabase import create_client, Client as SupabaseClient

load_dotenv()

def send_daily_rank_messages():
    # Initialize Twilio
    twilio_client = Client(
        os.getenv('TWILIO_ACCOUNT_SID'),
        os.getenv('TWILIO_AUTH_TOKEN')
    )
    
    # Initialize Supabase
    supabase: SupabaseClient = create_client(
        os.getenv('SUPABASE_URL'),
        os.getenv('SUPABASE_SERVICE_ROLE_KEY')
    )
    
    # Get all users who opted in, have verified phone numbers, and have a rank
    response = supabase.table('users').select('phone_number, username, all_time_rank, anon_id').eq('opt_in_texts', True).eq('phone_verified', True).not_.is_('phone_number', 'null').not_.is_('all_time_rank', 'null').order('all_time_rank').execute()
    
    users = response.data
    
    if len(users) == 0:
        print('No users found to send messages to.')
        return
    
    print(f"Sending daily rank messages to {len(users)} users...")
    
    success_count = 0
    fail_count = 0
    
    for user in users:
        try:
            username = user.get('username') or 'Player'
            rank = user.get('all_time_rank')
            
            message = f"You are ranked #{rank}, {username}. Thank you for playing, and play Rebus Race again today! www.rebusrace.com"
            
            twilio_client.messages.create(
                body=message,
                from_=os.getenv('TWILIO_PHONE_NUMBER'),
                to=user['phone_number']
            )
            
            print(f"✓ Sent to {username} (Rank #{rank}) - {user['phone_number']}")
            success_count += 1
            
            # Small delay to avoid rate limits
            time.sleep(1)
        except Exception as e:
            username = user.get('username') or user.get('anon_id', 'Unknown')
            print(f"✗ Failed to send to {username}: {str(e)}")
            fail_count += 1
    
    print(f"\nComplete! Sent: {success_count}, Failed: {fail_count}")

if __name__ == '__main__':
    send_daily_rank_messages()

