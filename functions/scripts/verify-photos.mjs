import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'vfit-funlife' });
const db = admin.firestore();

const venue = await db.collection('venues').doc('carosello').get();
console.log('carosello venue photoUrls count:', venue.data()?.photoUrls?.length ?? 'none');

const trainer = await db.collection('instructors').doc('demo-trainer-yoga-01').get();
console.log('demo-trainer-yoga-01 photoUrls count:', trainer.data()?.photoUrls?.length ?? 'none');

const sampleVenue = await db.collection('venues').doc('demo-venue-bari-gym-1').get();
console.log('demo-venue-bari-gym-1 photoUrls count:', sampleVenue.data()?.photoUrls?.length ?? 'none');

const counts = await db.collection('venues').where('photoUrls', '!=', null).get();
console.log('venues with photoUrls:', counts.size);

const tCounts = await db.collection('instructors').where('photoUrls', '!=', null).get();
console.log('instructors with photoUrls:', tCounts.size);

process.exit(0);
