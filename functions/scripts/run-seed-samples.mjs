import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'vfit-funlife' });

const mod = await import('../lib/seed/seedData.js');

console.log('[seed-samples] Running seedSampleVenues...');
const v = await mod.seedSampleVenues();
console.log('  →', JSON.stringify(v));

console.log('[seed-samples] Running seedSampleInstructors...');
const i = await mod.seedSampleInstructors();
console.log('  →', JSON.stringify(i));

process.exit(0);
