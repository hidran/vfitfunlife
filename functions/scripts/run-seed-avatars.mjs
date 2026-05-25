import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'vfit-funlife' });

const mod = await import('../lib/seed/seedData.js');

console.log('[seed-avatars] Starting generateDemoAvatars...');
const start = Date.now();
const results = await mod.generateDemoAvatars();
console.log(`[seed-avatars] Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
console.log(JSON.stringify(results, null, 2));
process.exit(0);
