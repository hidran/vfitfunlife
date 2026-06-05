import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'vfit-funlife' });
const db = admin.firestore();

const cats = ['Personal Training', 'Massaggio', 'Yoga', 'Fisioterapia', 'Nutrizione', 'Pilates'];
for (const cat of cats) {
  const snap = await db
    .collection('instructors')
    .where('providerProfile.isVerified', '==', true)
    .where('providerProfile.specialties', 'array-contains', cat)
    .limit(5)
    .get();
  console.log(`${cat}: ${snap.size} matches`);
  snap.forEach((d) => {
    const p = d.data();
    console.log(`  - ${d.id}: ${p.fullName} [${p.providerProfile.specialties.join(', ')}]`);
  });
}

process.exit(0);
