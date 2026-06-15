#!/usr/bin/env python3
import os
import re
import sys
import subprocess
import time
import random

print("✨ Supabase Media Migration Tool for Sura Birthday Website (Python) ✨")
print("====================================================================\n")

# 1. Read config.js to extract keys
config_path = os.path.join(os.path.dirname(__file__), 'config.js')
if not os.path.exists(config_path):
    print("❌ Error: config.js not found. Please create it first.")
    sys.exit(1)

with open(config_path, 'r', encoding='utf-8') as f:
    config_content = f.read()

url_match = re.search(r'url\s*:\s*["\'](.*?)["\']', config_content)
key_match = re.search(r'anonKey\s*:\s*["\'](.*?)["\']', config_content)

url = url_match.group(1) if url_match else ''
key = key_match.group(1) if key_match else ''

# Clean url just in case
if url:
    url = re.sub(r'/rest/v1/?$', '', url).strip()

if not url or not key:
    print("❌ Error: Supabase URL or Anon Key is missing in config.js.")
    print("Please open config.js and enter your credentials.")
    sys.exit(1)

# 2. Try loading supabase package, install if missing
try:
    from supabase import create_client, Client
except ImportError:
    print("📦 Installing required Python dependencies (supabase)...")
    print("Please wait a moment...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "supabase"])
        from supabase import create_client, Client
        print("✅ Dependencies installed successfully.\n")
    except Exception as e:
        print(f"\n❌ Failed to install supabase. Please run: pip install supabase")
        print(f"Error details: {e}")
        sys.exit(1)

# Initialize client
supabase: Client = create_client(url, key)

# 3. Detect and select local source folder
root_dir = os.path.dirname(os.path.abspath(__file__))
subdirs = sorted([d for d in os.listdir(root_dir) if os.path.isdir(os.path.join(root_dir, d)) and not d.startswith('.')])

print("📂 Select the local source folder containing files to upload:")
print("  1. [Root Folder] (files directly in Sura Birthday/)")
for idx, sd in enumerate(subdirs, start=2):
    print(f"  {idx}. {sd}/")
print(f"  {len(subdirs) + 2}. [Create and use a new folder]")
print(f"  {len(subdirs) + 3}. [Enter custom path]")

src_choice = input(f"Select option (1-{len(subdirs)+3}, default 1): ").strip()

source_path = root_dir
selected_local_folder_name = "Root"

if not src_choice or src_choice == "1":
    source_path = root_dir
    selected_local_folder_name = "Root"
elif src_choice.isdigit() and 2 <= int(src_choice) <= len(subdirs) + 1:
    selected_local_folder_name = subdirs[int(src_choice) - 2]
    source_path = os.path.join(root_dir, selected_local_folder_name)
elif src_choice.isdigit() and int(src_choice) == len(subdirs) + 2:
    new_folder_name = input("Enter new folder name to create (e.g., Sreeparvathy): ").strip()
    if not new_folder_name:
        print("❌ Invalid name. Using root directory.")
        source_path = root_dir
        selected_local_folder_name = "Root"
    else:
        source_path = os.path.join(root_dir, new_folder_name)
        os.makedirs(source_path, exist_ok=True)
        print(f"✅ Created folder: {new_folder_name}/ at {source_path}")
        print("👉 Please copy your images/videos into this folder now, then press Enter to continue...")
        input("Press Enter once files are in place...")
        selected_local_folder_name = new_folder_name
else:
    custom_path = input("Enter full custom folder path: ").strip()
    if os.path.exists(custom_path) and os.path.isdir(custom_path):
        source_path = custom_path
        selected_local_folder_name = os.path.basename(custom_path)
    else:
        print("❌ Path does not exist or is not a directory. Using root directory.")
        source_path = root_dir
        selected_local_folder_name = "Root"

# Scan the selected source directory for media files
IGNORED_FILES = [
    'background.png',
    'ghibli_bg.png',
    'config.js',
    'script.js',
    'style.css',
    'index.html',
    'shuffle_frames.py',
    'update_html.py',
    'upload_to_supabase.js',
    'upload_to_supabase.py',
    'package.json',
    'package-lock.json',
    'requirements.txt'
]

IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif']
VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm']

files_in_dir = os.listdir(source_path)
media_files = []

for file in files_in_dir:
    if file.startswith('.') or file in IGNORED_FILES:
        continue
    
    file_path = os.path.join(source_path, file)
    if os.path.isfile(file_path):
        ext = os.path.splitext(file)[1].lower()
        if ext in IMAGE_EXTENSIONS:
            media_files.append({'name': file, 'type': 'image', 'path': file_path, 'ext': ext})
        elif ext in VIDEO_EXTENSIONS:
            media_files.append({'name': file, 'type': 'video', 'path': file_path, 'ext': ext})

if not media_files:
    print(f"ℹ️ No media files found to upload in: {source_path}")
    sys.exit(0)

# Suggest default target folder based on selected local folder name
default_target = "Abhijith"
if selected_local_folder_name.lower() == "meenakshi":
    default_target = "Meenakshi"
elif selected_local_folder_name.lower() == "sreeparvathy":
    default_target = "Sreeparvathy"
elif selected_local_folder_name.lower() == "aiswarya":
    default_target = "Aiswarya"

print(f"\n📁 Select Destination Folder/Tab in Supabase:")
print("  1. Abhijith")
print("  2. Meenakshi")
print("  3. Sreeparvathy")
print("  4. Aiswarya")
print("  5. Custom Name")
choice = input(f"Select choice (1-5, or press Enter for '{default_target}'): ").strip()

selected_folder = default_target
if choice == "1":
    selected_folder = "Abhijith"
elif choice == "2":
    selected_folder = "Meenakshi"
elif choice == "3":
    selected_folder = "Sreeparvathy"
elif choice == "4":
    selected_folder = "Aiswarya"
elif choice == "5":
    custom_name = input("Enter custom destination folder name: ").strip()
    if custom_name:
        selected_folder = custom_name

print(f"\n🚀 Source folder: {source_path}")
print(f"🚀 Target folder: {selected_folder}")
print(f"🔍 Found {len(media_files)} media files to migrate.\n")

def migrate():
    success_count = 0
    fail_count = 0

    for i, file in enumerate(media_files):
        ext_clean = file['ext'].replace('.', '')
        sanitized_name = f"{int(time.time())}-{random.randint(1000, 9999)}.{ext_clean}"
        folder = 'videos' if file['type'] == 'video' else 'images'
        storage_path = f"{selected_folder}/{folder}/{sanitized_name}"

        print(f"[{i + 1}/{len(media_files)}] Uploading {file['name']}...")

        try:
            # 1. Upload to storage bucket 'memories'
            with open(file['path'], 'rb') as f_media:
                media_data = f_media.read()

            content_type = 'video/mp4' if file['type'] == 'video' else f"image/{'jpeg' if ext_clean == 'jpg' else ext_clean}"
            
            response = supabase.storage.from_('memories').upload(
                path=storage_path,
                file=media_data,
                file_options={"content-type": content_type, "cache-control": "3600", "x-upsert": "false"}
            )
            
            # 2. Get public URL
            public_url = supabase.storage.from_('memories').get_public_url(storage_path)

            # 3. Insert into database table 'memories'
            friendly_title = os.path.splitext(file['name'])[0].replace('-', ' ').replace('_', ' ')
            
            db_response = supabase.table('memories').insert({
                'url': public_url,
                'file_path': storage_path,
                'media_type': file['type'],
                'title': friendly_title,
                'description': '',
                'folder': selected_folder
            }).execute()

            print("  ✅ Successfully migrated!")
            success_count += 1

        except Exception as err:
            print(f"  ❌ Migration error: {err}")
            try:
                supabase.storage.from_('memories').remove(storage_path)
            except:
                pass
            fail_count += 1

    print('\n============================================================')
    print('📊 Migration Report:')
    print(f'   Total Files: {len(media_files)}')
    print(f'   Success:     {success_count}')
    print(f'   Failed:      {fail_count}')
    print('============================================================\n')

    if success_count > 0:
        print("🎉 Migration complete! Open the website to see your memories loading from Supabase.")
    else:
        print("⚠️ Migration failed to upload any files. Please check bucket policies and credentials.")

if __name__ == '__main__':
    migrate()
