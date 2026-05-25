import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'vfit-funlife' });
const mod = await import('../lib/seed/seedData.js');

console.log('[seed-coords] Starting generateDemoProviderCoords...');
const start = Date.now();
const results = await mod.generateDemoProviderCoords();
console.log(`[seed-coords] Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
console.log(JSON.stringify(results, null, 2));
process.exit(0);
