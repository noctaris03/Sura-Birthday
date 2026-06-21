#!/usr/bin/env python3
"""Upload the hero profile image to Supabase storage and print the public URL."""
import os
import re
import sys
import time

# Read config.js
config_path = os.path.join(os.path.dirname(__file__), 'config.js')
with open(config_path, 'r', encoding='utf-8') as f:
    config_content = f.read()

url_match = re.search(r'url\s*:\s*["\']([^"\']+)["\']', config_content)
key_match = re.search(r'anonKey\s*:\s*["\']([^"\']+)["\']', config_content)

url = url_match.group(1) if url_match else ''
key = key_match.group(1) if key_match else ''

if not url or not key:
    print("Missing Supabase URL or Key in config.js")
    sys.exit(1)

try:
    from supabase import create_client
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "supabase"])
    from supabase import create_client

supabase = create_client(url, key)

# The hero image file
image_name = "WhatsApp Image 2026-06-21 at 14.45.23.jpeg"
image_path = os.path.join(os.path.dirname(__file__), image_name)

if not os.path.exists(image_path):
    print("Image not found: " + image_path)
    sys.exit(1)

print("Uploading hero image: " + image_name)

# Use a clean storage path
storage_path = "hero/sura-profile.jpeg"

with open(image_path, 'rb') as f:
    data = f.read()

# Upload with upsert=true so it overwrites if it already exists
response = supabase.storage.from_('memories').upload(
    path=storage_path,
    file=data,
    file_options={"content-type": "image/jpeg", "cache-control": "3600", "x-upsert": "true"}
)

public_url = supabase.storage.from_('memories').get_public_url(storage_path)

print("Upload successful!")
print("Public URL:")
print(public_url)
