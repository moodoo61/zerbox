import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const audioFolderPath = path.join(__dirname, '..', 'data', 'json', 'audio');
const audioStoragePath = path.join(__dirname, '..', 'data', 'audio');
const basePath = path.join(__dirname, '..');

// Ensure audio storage directory exists
fs.ensureDirSync(audioStoragePath);

// Download function
function downloadFile(url, filePath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        
        const file = fs.createWriteStream(filePath);
        
        protocol.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Handle redirects
                return downloadFile(response.headers.location, filePath)
                    .then(resolve)
                    .catch(reject);
            }
            
            if (response.statusCode !== 200) {
                file.close();
                fs.unlinkSync(filePath);
                return reject(new Error(`Failed to download: ${response.statusCode}`));
            }
            
            response.pipe(file);
            
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            file.close();
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            reject(err);
        });
    });
}

// Process audio files for a surah
async function processSurahAudio(surahId) {
    const audioFilePath = path.join(audioFolderPath, `audio_surah_${surahId}.json`);
    
    if (!fs.existsSync(audioFilePath)) {
        console.log(`⚠️  Audio file not found for surah ${surahId}`);
        return { downloaded: 0, skipped: 0, failed: 0 };
    }
    
    const audioData = fs.readJSONSync(audioFilePath);
    const surahAudioPath = path.join(audioStoragePath, `surah_${surahId}`);
    fs.ensureDirSync(surahAudioPath);
    
    console.log(`\n📥 Processing Surah ${surahId} (${audioData.length} reciters)...`);
    
    let downloaded = 0;
    let failed = 0;
    let skipped = 0;
    const updatedAudioData = [];
    
    for (let i = 0; i < audioData.length; i++) {
        const audio = audioData[i];
        const fileName = `reciter_${audio.id}_${surahId.toString().padStart(3, '0')}.mp3`;
        const localPath = path.join(surahAudioPath, fileName);
        const relativePath = `/data/audio/surah_${surahId}/${fileName}`;
        
        // Check if file already exists
        if (fs.existsSync(localPath)) {
            console.log(`   ✓ [${i + 1}/${audioData.length}] ${audio.reciter.ar} - Already exists`);
            skipped++;
            // Update the link to local path
            updatedAudioData.push({
                ...audio,
                link: relativePath,
                originalLink: audio.link // Keep original as backup
            });
            continue;
        }
        
        // Get original link (might be updated already)
        const originalLink = audio.originalLink || audio.link;
        
        try {
            process.stdout.write(`   ⬇️  [${i + 1}/${audioData.length}] Downloading ${audio.reciter.ar}... `);
            await downloadFile(originalLink, localPath);
            
            downloaded++;
            console.log('✓');
            
            // Update with local path
            updatedAudioData.push({
                ...audio,
                link: relativePath,
                originalLink: originalLink // Keep original as backup
            });
            
            // Small delay to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            failed++;
            console.log(`✗ Failed: ${error.message}`);
            // Keep original link if download fails
            updatedAudioData.push({
                ...audio,
                link: originalLink,
                originalLink: originalLink
            });
        }
    }
    
    // Save updated audio data with local paths
    fs.writeJSONSync(audioFilePath, updatedAudioData, { spaces: 2 });
    
    console.log(`   ✅ Completed: ${downloaded} downloaded, ${skipped} skipped, ${failed} failed`);
    
    return { downloaded, skipped, failed };
}

// Main function
async function main() {
    console.log('🎵 Quran Audio Downloader');
    console.log('==========================\n');
    
    const surahsCount = 114;
    let totalDownloaded = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    
    // Process all surahs
    for (let surahId = 1; surahId <= surahsCount; surahId++) {
        try {
            const stats = await processSurahAudio(surahId);
            if (stats) {
                totalDownloaded += stats.downloaded;
                totalSkipped += stats.skipped;
                totalFailed += stats.failed;
            }
        } catch (error) {
            console.error(`❌ Error processing surah ${surahId}:`, error.message);
        }
    }
    
    console.log('\n==========================');
    console.log('✅ Download Complete!');
    console.log(`📊 Total: ${totalDownloaded} downloaded, ${totalSkipped} skipped, ${totalFailed} failed`);
    console.log(`📁 Audio files saved to: ${audioStoragePath}`);
}

// Run if called directly
main().catch(console.error);

export { processSurahAudio, downloadFile };
