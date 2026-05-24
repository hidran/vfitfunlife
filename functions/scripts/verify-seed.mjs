import admin from 'firebase-admin';

admin.initializeApp({ projectId: 'vfit-funlife' });
const db = admin.firestore();

const venues = await db.collection('venues').where('isActive', '==', true).limit(5).get();
console.log(`Sample venues (${venues.size}):`);
venues.forEach((d) => {
  const v = d.data();
  console.log(`  ${d.id} → ${v.name} (${v.type}, ${v.city}, ★${v.rating})`);
});

const instructors = await db
  .collection('instructors')
  .where('providerProfile.isVerified', '==', true)
  .limit(5)
  .get();
console.log(`\nSample instructors (${instructors.size}):`);
instructors.forEach((d) => {
  const p = d.data();
  console.log(
    `  ${d.id} → ${p.fullName} [${p.providerProfile.specialties.join(', ')}] ${p.city} ★${p.providerProfile.rating}`
  );
});

// Spot-check a subcollection
const carosello = await db.collection('venues').doc('carosello').collection('services').get();
console.log(`\nCarosello services (${carosello.size}):`);
carosello.forEach((d) => console.log(`  ${d.id}: ${d.data().name} €${d.data().price}`));

process.exit(0);
