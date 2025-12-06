#!/usr/bin/env python3
"""
Mass Text Sender using Twilio (Python version)
Run with: python scripts/send-mass-text-python.py "Your message here"

Setup:
1. Install: pip install twilio supabase python-dotenv
2. Create .env file with:
   TWILIO_ACCOUNT_SID=your_account_sid
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+1234567890
   SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
"""

import os
import sys
import time
from dotenv import load_dotenv
from twilio.rest import Client
from supabase import create_client, Client as SupabaseClient

load_dotenv()

def send_mass_text(message: str):
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
    
    # Get all users who opted in and have verified phone numbers
    response = supabase.table('users').select('phone_number, username, anon_id').eq('opt_in_texts', True).eq('phone_verified', True).not_.is_('phone_number', 'null').execute()
    
    users = response.data
    print(f"Sending text to {len(users)} users...")
    
    success_count = 0
    fail_count = 0
    
    for user in users:
        try:
            twilio_client.messages.create(
                body=message,
                from_=os.getenv('TWILIO_PHONE_NUMBER'),
                to=user['phone_number']
            )
            username = user.get('username') or user.get('anon_id', 'Unknown')
            print(f"✓ Sent to {username} ({user['phone_number']})")
            success_count += 1
            
            # Small delay to avoid rate limits
            time.sleep(1)
        except Exception as e:
            username = user.get('username') or user.get('anon_id', 'Unknown')
            print(f"✗ Failed to send to {username}: {str(e)}")
            fail_count += 1
    
    print(f"\nComplete! Sent: {success_count}, Failed: {fail_count}")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Please provide a message: python scripts/send-mass-text-python.py "Your message here"')
        sys.exit(1)
    
    message = sys.argv[1]
    send_mass_text(message)

