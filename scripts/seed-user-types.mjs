#!/usr/bin/env node
/**
 * Firestore Seed Script for User Types
 * 
 * This script populates the userTypes collection in Firestore
 * with the predefined user type data.
 * 
 * Usage:
 *   node scripts/seed-user-types.mjs
 * 
 * Environment variables:
 *   - GOOGLE_APPLICATION_CREDENTIALS: Path to service account JSON file
 *   - FIREBASE_PROJECT_ID: Firebase project ID (optional if using service account)
 *   - FORCE_UPDATE: Set to 'true' to update existing documents (default: false)
 */

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Initialize Firebase Admin
const projectId = process.env.FIREBASE_PROJECT_ID || "vfit-funlife";
const forceUpdate = process.env.FORCE_UPDATE === "true";

if (getApps().length === 0) {
  initializeApp({
    projectId: projectId,
  });
}

const db = getFirestore();

/**
 * User type seed data
 */
const userTypesSeedData = [
  {
    id: "personal_trainer",
    name: "Personal Trainer",
    slug: "personal-trainer",
    description: "Professionista del fitness specializzato in allenamento personalizzato one-to-one",
    icon: "dumbbell",
    category: "fitness",
    services: [
      {
        id: "one_on_one_training",
        name: "Allenamento One-to-One",
        description: "Sessione di allenamento personalizzata individuale",
        durationOptions: [30, 45, 60, 90],
        pricingType: "session",
      },
      {
        id: "group_training",
        name: "Allenamento di Gruppo",
        description: "Sessione di allenamento per piccoli gruppi (max 4 persone)",
        durationOptions: [45, 60],
        pricingType: "session",
      },
      {
        id: "online_coaching",
        name: "Coaching Online",
        description: "Sessione di training via video call con programma personalizzato",
        durationOptions: [30, 45, 60],
        pricingType: "session",
      },
    ],
    requirements: {
      certifications: ["Certificazione Personal Trainer riconosciuta (ISSA, NASM, ACE)"],
      yearsExperience: 1,
      backgroundCheck: false,
      insuranceRequired: true,
    },
    tags: ["fitness", "allenamento", "palestra", "dimagrimento"],
    isActive: true,
    displayOrder: 1,
  },
  {
    id: "yoga_teacher",
    name: "Insegnante di Yoga",
    slug: "yoga-teacher",
    description: "Insegnante certificato di yoga per lezioni private e di gruppo",
    icon: "flower-2",
    category: "wellness",
    services: [
      {
        id: "private_yoga",
        name: "Lezione Privata di Yoga",
        description: "Sessione yoga personalizzata one-to-one",
        durationOptions: [45, 60, 90],
        pricingType: "session",
      },
      {
        id: "group_yoga",
        name: "Lezione di Gruppo",
        description: "Classe yoga per gruppi fino a 10 persone",
        durationOptions: [60, 75, 90],
        pricingType: "session",
      },
      {
        id: "prenatal_yoga",
        name: "Yoga Prenatale",
        description: "Yoga specifico per donne in gravidanza",
        durationOptions: [45, 60],
        pricingType: "session",
      },
    ],
    requirements: {
      certifications: ["Certificazione Yoga Alliance (RYT-200 minimo)"],
      yearsExperience: 1,
      backgroundCheck: false,
      insuranceRequired: true,
    },
    tags: ["yoga", "benessere", "meditazione", "rilassamento"],
    isActive: true,
    displayOrder: 2,
  },
  {
    id: "nutritionist",
    name: "Nutrizionista",
    slug: "nutritionist",
    description: "Specialista in nutrizione e piani alimentari personalizzati",
    icon: "apple",
    category: "wellness",
    services: [
      {
        id: "nutrition_consultation",
        name: "Consultazione Nutrizionale",
        description: "Valutazione delle abitudini alimentari e piano nutrizionale",
        durationOptions: [45, 60],
        pricingType: "session",
      },
      {
        id: "meal_plan",
        name: "Piano Alimentare Personalizzato",
        description: "Piano alimentare settimanale su misura",
        durationOptions: [30],
        pricingType: "fixed",
      },
      {
        id: "follow_up",
        name: "Controllo di Follow-up",
        description: "Sessione di monitoraggio progressi e aggiustamenti",
        durationOptions: [20, 30],
        pricingType: "session",
      },
    ],
    requirements: {
      certifications: ["Laurea in Scienze della Nutrizione o Biologia"],
      yearsExperience: 0,
      backgroundCheck: false,
      insuranceRequired: false,
    },
    tags: ["nutrizione", "dieta", "salute", "benessere"],
    isActive: true,
    displayOrder: 3,
  },
  {
    id: "hairstylist",
    name: "Parrucchiere",
    slug: "hairstylist",
    description: "Stylist professionale per taglio, colore e trattamenti capelli",
    icon: "scissors",
    category: "beauty",
    services: [
      {
        id: "haircut",
        name: "Taglio",
        description: "Taglio e styling personalizzato",
        durationOptions: [30, 45, 60],
        pricingType: "fixed",
      },
      {
        id: "color",
        name: "Colore",
        description: "Colorazione completa o ritocco radici",
        durationOptions: [60, 90, 120],
        pricingType: "fixed",
      },
      {
        id: "treatment",
        name: "Trattamento",
        description: "Trattamento ristrutturante o idratante",
        durationOptions: [30, 45, 60],
        pricingType: "fixed",
      },
    ],
    requirements: {
      certifications: ["Diploma di Qualifica Professionale di Parrucchiere"],
      yearsExperience: 0,
      backgroundCheck: false,
      insuranceRequired: false,
    },
    tags: ["capelli", "bellezza", "taglio", "colore"],
    isActive: true,
    displayOrder: 4,
  },
  {
    id: "psychologist",
    name: "Psicologo",
    slug: "psychologist",
    description: "Psicologo iscritto all'Albo per terapia individuale e di coppia",
    icon: "brain",
    category: "mental_health",
    services: [
      {
        id: "individual_therapy",
        name: "Terapia Individuale",
        description: "Sessione di psicoterapia individuale",
        durationOptions: [45, 50, 60],
        pricingType: "session",
      },
      {
        id: "couples_therapy",
        name: "Terapia di Coppia",
        description: "Sessione di consulenza per coppie",
        durationOptions: [60, 75, 90],
        pricingType: "session",
      },
      {
        id: "psychological_assessment",
        name: "Valutazione Psicologica",
        description: "Assessment completo con report",
        durationOptions: [90, 120],
        pricingType: "fixed",
      },
    ],
    requirements: {
      certifications: ["Laurea in Psicologia e Iscrizione all'Albo"],
      yearsExperience: 0,
      backgroundCheck: true,
      insuranceRequired: true,
      licenseRequired: true,
      licenseTypes: ["Iscrizione Sezione A o B dell'Albo degli Psicologi"],
    },
    tags: ["psicologia", "terapia", "benessere mentale", "counseling"],
    isActive: true,
    displayOrder: 5,
  },
  {
    id: "pronunciation_coach",
    name: "Coach di Pronuncia",
    slug: "pronunciation-coach",
    description: "Insegnante madrelingua per migliorare pronuncia e fluency",
    icon: "languages",
    category: "education",
    services: [
      {
        id: "private_coaching",
        name: "Coaching Privato",
        description: "Lezione one-to-one di pronuncia e fluency",
        durationOptions: [30, 45, 60],
        pricingType: "session",
      },
      {
        id: "group_coaching",
        name: "Coaching di Gruppo",
        description: "Lezione per piccoli gruppi (max 6 persone)",
        durationOptions: [60, 90],
        pricingType: "session",
      },
      {
        id: "business_english",
        name: "Business English Coaching",
        description: "Coaching specifico per contesti professionali",
        durationOptions: [45, 60],
        pricingType: "session",
      },
    ],
    requirements: {
      certifications: ["TEFL/TESOL o equivalente", "Madrelingua inglese o C2"],
      yearsExperience: 1,
      backgroundCheck: false,
      insuranceRequired: false,
    },
    tags: ["inglese", "pronuncia", "lingue", "fluency"],
    isActive: true,
    displayOrder: 6,
  },
  {
    id: "massage_therapist",
    name: "Massaggiatore",
    slug: "massage-therapist",
    description: "Terapeuta del massaggio per relax e trattamenti specifici",
    icon: "hand",
    category: "wellness",
    services: [
      {
        id: "relaxing_massage",
        name: "Massaggio Rilassante",
        description: "Massaggio Swedish per relax generale",
        durationOptions: [30, 45, 60, 90],
        pricingType: "session",
      },
      {
        id: "deep_tissue",
        name: "Deep Tissue Massage",
        description: "Massaggio terapeutico per tensioni muscolari",
        durationOptions: [45, 60, 90],
        pricingType: "session",
      },
      {
        id: "sports_massage",
        name: "Massaggio Sportivo",
        description: "Massaggio specifico per atleti",
        durationOptions: [30, 45, 60],
        pricingType: "session",
      },
    ],
    requirements: {
      certifications: ["Certificazione massaggio terapeutico o estetica"],
      yearsExperience: 0,
      backgroundCheck: false,
      insuranceRequired: true,
    },
    tags: ["massaggio", "benessere", "relax", "terapia"],
    isActive: true,
    displayOrder: 7,
  },
  {
    id: "life_coach",
    name: "Life Coach",
    slug: "life-coach",
    description: "Coach certificato per sviluppo personale e professionale",
    icon: "compass",
    category: "mental_health",
    services: [
      {
        id: "discovery_session",
        name: "Sessione di Discovery",
        description: "Prima consulenza per definire obiettivi",
        durationOptions: [30, 45],
        pricingType: "session",
      },
      {
        id: "coaching_session",
        name: "Sessione di Coaching",
        description: "Sessione di coaching one-to-one",
        durationOptions: [45, 60],
        pricingType: "session",
      },
      {
        id: "package",
        name: "Pacchetto Coaching",
        description: "Pacchetto di 6 sessioni con supporto continuo",
        durationOptions: [45],
        pricingType: "fixed",
      },
    ],
    requirements: {
      certifications: ["Certificazione Coaching ICF o equivalente"],
      yearsExperience: 1,
      backgroundCheck: false,
      insuranceRequired: false,
    },
    tags: ["coaching", "sviluppo personale", "crescita", "obiettivi"],
    isActive: true,
    displayOrder: 8,
  },
  {
    id: "physical_therapist",
    name: "Fisioterapista",
    slug: "physical-therapist",
    description: "Fisioterapista laureato per riabilitazione e terapia fisica",
    icon: "activity",
    category: "medical",
    services: [
      {
        id: "evaluation",
        name: "Valutazione Fisioterapica",
        description: "Assessment completo e piano di trattamento",
        durationOptions: [45, 60],
        pricingType: "session",
      },
      {
        id: "treatment_session",
        name: "Sessione di Trattamento",
        description: "Sessione terapeutica personalizzata",
        durationOptions: [30, 45, 60],
        pricingType: "session",
      },
      {
        id: "sports_rehab",
        name: "Riabilitazione Sportiva",
        description: "Programma riabilitativo per atleti",
        durationOptions: [45, 60],
        pricingType: "session",
      },
    ],
    requirements: {
      certifications: ["Laurea in Fisioterapia e Iscrizione all'Albo"],
      yearsExperience: 0,
      backgroundCheck: true,
      insuranceRequired: true,
      licenseRequired: true,
      licenseTypes: ["Iscrizione Albo Fisioterapisti"],
    },
    tags: ["fisioterapia", "riabilitazione", "salute", "sport"],
    isActive: true,
    displayOrder: 9,
  },
  {
    id: "dietitian",
    name: "Dietista",
    slug: "dietitian",
    description: "Dietista per piani alimentari terapeutici e dimagrimento",
    icon: "salad",
    category: "medical",
    services: [
      {
        id: "nutritional_assessment",
        name: "Valutazione Nutrizionale",
        description: "Analisi completa stato nutrizionale",
        durationOptions: [45, 60],
        pricingType: "session",
      },
      {
        id: "therapeutic_plan",
        name: "Piano Terapeutico",
        description: "Piano alimentare per patologie specifiche",
        durationOptions: [30, 45],
        pricingType: "fixed",
      },
      {
        id: "weight_management",
        name: "Gestione del Peso",
        description: "Programma dimagrimento con follow-up",
        durationOptions: [30],
        pricingType: "fixed",
      },
    ],
    requirements: {
      certifications: ["Laurea in Dietistica e Iscrizione all'Albo"],
      yearsExperience: 0,
      backgroundCheck: false,
      insuranceRequired: false,
      licenseRequired: true,
      licenseTypes: ["Iscrizione Albo Professioni Sanitarie - Sezione Dietista"],
    },
    tags: ["dieta", "nutrizione", "dimagrimento", "salute"],
    isActive: true,
    displayOrder: 10,
  },
];

/**
 * Main seed function
 */
async function seedUserTypes() {
  console.log("\n🌱 Starting User Types seed...\n");

  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  for (const userType of userTypesSeedData) {
    try {
      const docRef = db.collection("userTypes").doc(userType.id);
      const existingDoc = await docRef.get();

      const data = {
        ...userType,
        createdAt: existingDoc.exists ? existingDoc.data()?.createdAt : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (existingDoc.exists) {
        if (forceUpdate) {
          await docRef.update(data);
          console.log(`♻️  Updated: ${userType.name}`);
          results.updated++;
        } else {
          console.log(`⏭️  Skipped: ${userType.name} (use FORCE_UPDATE=true to update)`);
          results.skipped++;
        }
      } else {
        await docRef.set(data);
        console.log(`✅ Created: ${userType.name}`);
        results.created++;
      }
    } catch (error) {
      const errorMessage = `❌ Error with ${userType.name}: ${error}`;
      console.error(errorMessage);
      results.errors.push(errorMessage);
    }
  }

  console.log("\n📊 Summary:");
  console.log(`   Created: ${results.created}`);
  console.log(`   Updated: ${results.updated}`);
  console.log(`   Skipped: ${results.skipped}`);

  if (results.errors.length > 0) {
    console.log(`\n❌ Errors: ${results.errors.length}`);
    results.errors.forEach((err) => console.log(`   - ${err}`));
    process.exit(1);
  }

  console.log("\n✨ User types seed completed successfully!\n");
}

// Run the seed function
seedUserTypes().catch((error) => {
  console.error("\n💥 Fatal error during seeding:", error);
  process.exit(1);
});
