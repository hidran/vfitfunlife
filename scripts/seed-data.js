/**
 * Direct Firestore Seed Script
 * Run with: node scripts/seed-data.js
 */

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

// Initialize Firebase Admin
if (getApps().length === 0) {
  initializeApp({
    projectId: 'vfit-funlife',
  });
}

const db = getFirestore();

const userTypes = [
  {
    id: "personal_trainer",
    name: "Personal Trainer",
    slug: "personal-trainer",
    description: "Professionista del fitness specializzato in allenamento personalizzato",
    icon: "dumbbell",
    category: "fitness",
    services: [
      { id: "one_on_one", name: "Allenamento One-to-One", description: "Sessione individuale", durationOptions: [30, 45, 60], pricingType: "session" },
      { id: "group", name: "Allenamento di Gruppo", description: "Piccoli gruppi", durationOptions: [45, 60], pricingType: "session" },
    ],
    requirements: { certifications: ["ISSA, NASM, o ACE"], yearsExperience: 1, insuranceRequired: true },
    tags: ["fitness", "allenamento", "palestra"],
    isActive: true, displayOrder: 1,
  },
  {
    id: "yoga_teacher",
    name: "Insegnante di Yoga",
    slug: "yoga-teacher",
    description: "Insegnante certificato di yoga",
    icon: "flower-2",
    category: "wellness",
    services: [
      { id: "private", name: "Lezione Privata", description: "Sessione one-to-one", durationOptions: [45, 60, 90], pricingType: "session" },
      { id: "group", name: "Lezione di Gruppo", description: "Classe gruppo", durationOptions: [60, 75], pricingType: "session" },
    ],
    requirements: { certifications: ["RYT-200+"], yearsExperience: 1, insuranceRequired: true },
    tags: ["yoga", "benessere", "meditazione"],
    isActive: true, displayOrder: 2,
  },
  {
    id: "nutritionist",
    name: "Nutrizionista",
    slug: "nutritionist",
    description: "Specialista in nutrizione",
    icon: "apple",
    category: "wellness",
    services: [
      { id: "consult", name: "Consultazione", description: "Valutazione nutrizionale", durationOptions: [45, 60], pricingType: "session" },
      { id: "plan", name: "Piano Alimentare", description: "Piano personalizzato", durationOptions: [30], pricingType: "fixed" },
    ],
    requirements: { certifications: ["Laurea in Scienze della Nutrizione"] },
    tags: ["nutrizione", "dieta", "salute"],
    isActive: true, displayOrder: 3,
  },
  {
    id: "hairstylist",
    name: "Parrucchiere",
    slug: "hairstylist",
    description: "Stylist professionale",
    icon: "scissors",
    category: "beauty",
    services: [
      { id: "cut", name: "Taglio", description: "Taglio e styling", durationOptions: [30, 45, 60], pricingType: "fixed" },
      { id: "color", name: "Colore", description: "Colorazione", durationOptions: [60, 90], pricingType: "fixed" },
    ],
    requirements: { certifications: ["Diploma Parrucchiere"] },
    tags: ["capelli", "bellezza", "taglio"],
    isActive: true, displayOrder: 4,
  },
  {
    id: "psychologist",
    name: "Psicologo",
    slug: "psychologist",
    description: "Psicologo iscritto all'Albo",
    icon: "brain",
    category: "mental_health",
    services: [
      { id: "individual", name: "Terapia Individuale", description: "Sessione individuale", durationOptions: [45, 50, 60], pricingType: "session" },
      { id: "couples", name: "Terapia di Coppia", description: "Consulenza coppie", durationOptions: [60, 75], pricingType: "session" },
    ],
    requirements: { certifications: ["Laurea in Psicologia e Iscrizione Albo"], backgroundCheck: true, insuranceRequired: true, licenseRequired: true },
    tags: ["psicologia", "terapia", "benessere mentale"],
    isActive: true, displayOrder: 5,
  },
  {
    id: "pronunciation_coach",
    name: "Coach di Pronuncia",
    slug: "pronunciation-coach",
    description: "Insegnante madrelingua per inglese",
    icon: "languages",
    category: "education",
    services: [
      { id: "private", name: "Coaching Privato", description: "Lezione one-to-one", durationOptions: [30, 45, 60], pricingType: "session" },
      { id: "business", name: "Business English", description: "Coaching professionale", durationOptions: [45, 60], pricingType: "session" },
    ],
    requirements: { certifications: ["TEFL/TESOL"], yearsExperience: 1 },
    tags: ["inglese", "pronuncia", "lingue"],
    isActive: true, displayOrder: 6,
  },
  {
    id: "massage_therapist",
    name: "Massaggiatore",
    slug: "massage-therapist",
    description: "Terapeuta del massaggio",
    icon: "hand",
    category: "wellness",
    services: [
      { id: "relaxing", name: "Massaggio Rilassante", description: "Swedish massage", durationOptions: [30, 45, 60, 90], pricingType: "session" },
      { id: "deep", name: "Deep Tissue", description: "Massaggio terapeutico", durationOptions: [45, 60, 90], pricingType: "session" },
    ],
    requirements: { certifications: ["Certificazione massaggio"], insuranceRequired: true },
    tags: ["massaggio", "benessere", "relax"],
    isActive: true, displayOrder: 7,
  },
  {
    id: "life_coach",
    name: "Life Coach",
    slug: "life-coach",
    description: "Coach per sviluppo personale",
    icon: "compass",
    category: "mental_health",
    services: [
      { id: "discovery", name: "Discovery Session", description: "Prima consulenza", durationOptions: [30, 45], pricingType: "session" },
      { id: "coaching", name: "Sessione Coaching", description: "Coaching one-to-one", durationOptions: [45, 60], pricingType: "session" },
    ],
    requirements: { certifications: ["ICF o equivalente"], yearsExperience: 1 },
    tags: ["coaching", "sviluppo personale", "crescita"],
    isActive: true, displayOrder: 8,
  },
  {
    id: "physical_therapist",
    name: "Fisioterapista",
    slug: "physical-therapist",
    description: "Fisioterapista laureato",
    icon: "activity",
    category: "medical",
    services: [
      { id: "eval", name: "Valutazione", description: "Assessment completo", durationOptions: [45, 60], pricingType: "session" },
      { id: "treatment", name: "Trattamento", description: "Sessione terapeutica", durationOptions: [30, 45, 60], pricingType: "session" },
    ],
    requirements: { certifications: ["Laurea in Fisioterapia"], backgroundCheck: true, insuranceRequired: true, licenseRequired: true },
    tags: ["fisioterapia", "riabilitazione", "salute"],
    isActive: true, displayOrder: 9,
  },
  {
    id: "dietitian",
    name: "Dietista",
    slug: "dietitian",
    description: "Dietista per piani alimentari",
    icon: "salad",
    category: "medical",
    services: [
      { id: "assessment", name: "Valutazione", description: "Analisi nutrizionale", durationOptions: [45, 60], pricingType: "session" },
      { id: "plan", name: "Piano Terapeutico", description: "Piano per patologie", durationOptions: [30, 45], pricingType: "fixed" },
    ],
    requirements: { certifications: ["Laurea in Dietistica"], licenseRequired: true },
    tags: ["dieta", "nutrizione", "dimagrimento"],
    isActive: true, displayOrder: 10,
  },
];

async function seed() {
  console.log('\n🌱 Seeding User Types...\n');
  
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();
  
  for (const userType of userTypes) {
    const docRef = db.collection('userTypes').doc(userType.id);
    batch.set(docRef, {
      ...userType,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`✅ ${userType.name}`);
  }
  
  await batch.commit();
  console.log('\n✨ User types seeded successfully!\n');
}

seed().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
