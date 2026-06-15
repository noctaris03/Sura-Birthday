#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('✨ Supabase Media Migration Tool for Sura Birthday Website ✨');
console.log('============================================================\n');

// 1. Load configuration from config.js
const configPath = path.join(__dirname, 'config.js');
if (!fs.existsSync(configPath)) {
    console.error('❌ Error: config.js not found. Please create it first.');
    process.exit(1);
}

const configContent = fs.readFileSync(configPath, 'utf8');
const urlMatch = configContent.match(/url\s*:\s*["'](.*?)["']/);
const keyMatch = configContent.match(/anonKey\s*:\s*["'](.*?)["']/);

const url = urlMatch ? urlMatch[1] : '';
const key = keyMatch ? keyMatch[1] : '';

if (!url || !key) {
    console.error('❌ Error: Supabase URL or Anon Key is missing in config.js.');
    console.log('Please open config.js and enter your credentials, or configure them.');
    process.exit(1);
}

// 2. Load Supabase JS Client (Dynamic Import or require)
let createClient;
try {
    const supabaseSDK = require('@supabase/supabase-js');
    createClient = supabaseSDK.createClient;
} catch (err) {
    console.log('📦 Installing required dependencies (@supabase/supabase-js)...');
    console.log('Please wait a moment...');
    try {
        const { execSync } = require('child_process');
        execSync('npm install @supabase/supabase-js --no-save', { stdio: 'inherit' });
        const supabaseSDK = require('@supabase/supabase-js');
        createClient = supabaseSDK.createClient;
        console.log('✅ Dependencies installed successfully.\n');
    } catch (installErr) {
        console.error('\n❌ Failed to install @supabase/supabase-js. Please run:');
        console.log('   npm init -y');
        console.log('   npm install @supabase/supabase-js');
        console.log('   node upload_to_supabase.js');
        process.exit(1);
    }
}

// Initialize client
const supabase = createClient(url, key);

// 3. Scan directory for media files
const IGNORED_FILES = [
    'background.png',
    'ghibli_bg.png',
    'config.js',
    'script.js',
    'style.css',
    'index.html',
    'shuffle_frames.py',
    'update_html.py',
    'upload_to_supabase.js',
    'package.json',
    'package-lock.json'
];

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm'];

const filesInDir = fs.readdirSync(__dirname);
const mediaFiles = [];

filesInDir.forEach(file => {
    // Skip hidden files and ignored list
    if (file.startsWith('.') || IGNORED_FILES.includes(file)) return;
    
    const filePath = path.join(__dirname, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isFile()) {
        const ext = path.extname(file).toLowerCase();
        if (IMAGE_EXTENSIONS.includes(ext)) {
            mediaFiles.push({ name: file, type: 'image', path: filePath });
        } else if (VIDEO_EXTENSIONS.includes(ext)) {
            mediaFiles.push({ name: file, type: 'video', path: filePath });
        }
    }
});

if (mediaFiles.length === 0) {
    console.log('ℹ️ No media files found to upload.');
    process.exit(0);
}

console.log(`🔍 Found ${mediaFiles.length} media files to migrate.\n`);

async function migrate() {
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < mediaFiles.length; i++) {
        const file = mediaFiles[i];
        const fileExt = path.extname(file.name).replace('.', '');
        const sanitizedName = `${Date.now()}-${Math.floor(Math.random() * 100000)}.${fileExt}`;
        const storagePath = `${file.type === 'video' ? 'videos' : 'images'}/${sanitizedName}`;

        console.log(`[${i + 1}/${mediaFiles.length}] Uploading ${file.name}...`);

        try {
            const fileBuffer = fs.readFileSync(file.path);
            
            // 1. Upload to storage bucket 'memories'
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('memories')
                .upload(storagePath, fileBuffer, {
                    contentType: file.type === 'video' ? 'video/mp4' : `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
                    cacheControl: '3600',
                    upsert: false
                });

            if (uploadError) {
                console.error(`  ❌ Storage upload error: ${uploadError.message}`);
                failCount++;
                continue;
            }

            // 2. Get public url
            const { data: { publicUrl } } = supabase.storage
                .from('memories')
                .getPublicUrl(storagePath);

            // 3. Insert into database
            const friendlyTitle = path.basename(file.name, path.extname(file.name)).replace(/[-_]/g, ' ');

            const { error: dbError } = await supabase
                .from('memories')
                .insert([
                    {
                        url: publicUrl,
                        file_path: storagePath,
                        media_type: file.type,
                        title: friendlyTitle,
                        description: ''
                    }
                ]);

            if (dbError) {
                console.error(`  ❌ Database insert error: ${dbError.message}`);
                // Attempt clean up from storage if db insert failed
                await supabase.storage.from('memories').remove([storagePath]);
                failCount++;
                continue;
            }

            console.log(`  ✅ Successfully migrated!`);
            successCount++;

        } catch (err) {
            console.error(`  ❌ Unexpected error: ${err.message}`);
            failCount++;
        }
    }

    console.log('\n============================================================');
    console.log('📊 Migration Report:');
    console.log(`   Total Files: ${mediaFiles.length}`);
    console.log(`   Success:     ${successCount}`);
    console.log(`   Failed:      ${failCount}`);
    console.log('============================================================\n');
    
    if (successCount > 0) {
        console.log('🎉 Migration complete! Open the website to see your memories loading from Supabase.');
    } else {
        console.log('⚠️ Migration failed to upload any files. Please check bucket policies and credentials.');
    }
}

migrate();
