import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'vfit-funlife' });

const mod = await import('../lib/seed/seedData.js');

console.log('[seed] Starting generateDemoFunActivities...');
const start = Date.now();
const results = await mod.generateDemoFunActivities();
const elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`[seed] Done in ${elapsed}s`);
console.log(JSON.stringify(results, null, 2));
process.exit(0);
