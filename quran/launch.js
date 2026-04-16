// Quran Data Auto Launcher
// تشغيل تلقائي للخادم وفتح المتصفح

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVER_URL = 'http://localhost:8081';
const MAX_RETRIES = 30;
const RETRY_DELAY = 1000;

console.log('');
console.log('========================================');
console.log('   القرآن الكريم - Quran Data');
console.log('========================================');
console.log('');

// Start server
console.log('[1/2] تشغيل الخادم...');
console.log('');

const serverProcess = spawn('node', ['server/server.mjs'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true
});

// Wait for server to start
console.log('[2/2] انتظار بدء الخادم...');

let retries = 0;
const checkServer = async () => {
    const req = http.get(SERVER_URL, async (res) => {
        if (res.statusCode === 200 || res.statusCode === 404) {
            console.log('✅ الخادم يعمل!');
            console.log('');
            console.log('========================================');
            console.log('   ✅ تم تشغيل التطبيق بنجاح!');
            console.log('========================================');
            console.log('');
            console.log(`الخادم يعمل على: ${SERVER_URL}`);
            console.log('');
            
            // Open browser
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execAsync = promisify(exec);
            
            const platform = process.platform;
            let command;
            
            if (platform === 'win32') {
                command = `start ${SERVER_URL}`;
            } else if (platform === 'darwin') {
                command = `open ${SERVER_URL}`;
            } else {
                command = `xdg-open ${SERVER_URL}`;
            }
            
            try {
                await execAsync(command);
                console.log('✅ تم فتح المتصفح!');
            } catch (error) {
                console.log('⚠️  لم يتم فتح المتصفح تلقائياً');
                console.log(`يرجى فتح المتصفح يدوياً على: ${SERVER_URL}`);
            }
            
            console.log('');
            console.log('لإيقاف الخادم، اضغط Ctrl+C');
            console.log('');
        }
    });
    
    req.on('error', () => {
        retries++;
        if (retries < MAX_RETRIES) {
            setTimeout(checkServer, RETRY_DELAY);
        } else {
            console.log('❌ فشل في بدء الخادم');
            console.log('يرجى التحقق من الأخطاء أعلاه');
            process.exit(1);
        }
    });
};

setTimeout(checkServer, 2000);

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n\nإيقاف الخادم...');
    serverProcess.kill();
    process.exit(0);
});

process.on('SIGTERM', () => {
    serverProcess.kill();
    process.exit(0);
});
