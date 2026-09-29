// Demo clients for the demo provider, so the provider "Clienti" area (list, detail tabs) and
// the customer's "Le mie schede" / shared recipes can be exercised end to end.
//
//   node scripts/seed-demo-clients.mjs                      # emulator (default)
//   node scripts/seed-demo-clients.mjs --project vfit-app-staging
//   node scripts/seed-demo-clients.mjs --project vfit-funlife
//
// Run seed-demo-accounts.mjs first: this script attaches to demo.provider / demo.customer by
// email (their uid can differ from the constant when the email pre-existed).
//
// Client 1 IS demo.customer, so both sides of the relationship are testable: the provider sees
// goals / programs / notes / bookings, the customer sees the published program and the shared
// recipe. Clients 2 and 3 are synthetic (no auth account) to give the list some variety.
//
// Idempotent: fixed doc ids + merge. Booking dates are relative to "now", so a re-run slides
// them forward rather than duplicating them.

import admin from "firebase-admin";

const args = process.argv.slice(2);
const projectFlag = args.indexOf("--project");
const project = projectFlag === -1 ? null : args[projectFlag + 1];

if (!project) {
  process.env.FIRESTORE_EMULATOR_HOST ||= "localhost:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "localhost:9099";
} else {
  delete process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
}

admin.initializeApp({ projectId: project ?? "vfit-funlife" });
const auth = admin.auth();
const db = admin.firestore();
const { Timestamp, FieldValue } = admin.firestore;

const DAY = 24 * 60 * 60 * 1000;
const nowMs = Date.now();
const at = (offsetDays, hour = 18) => {
  const d = new Date(nowMs + offsetDays * DAY);
  d.setHours(hour, 0, 0, 0);
  return Timestamp.fromDate(d);
};

const providerUser = await auth.getUserByEmail("demo.provider@vitfitdemo.dev");
const customerUser = await auth.getUserByEmail("demo.customer@vitfitdemo.dev");
const providerUid = providerUser.uid;
const customerUid = customerUser.uid;

const instructor = (await db.collection("instructors").doc(providerUid).get()).data() ?? {};
const servicesSnap = await db.collection("instructors").doc(providerUid).collection("services").get();
const service = servicesSnap.docs[0]
  ? { id: servicesSnap.docs[0].id, ...servicesSnap.docs[0].data() }
  : { id: "demo-service-personal-training", name: "Personal Training Demo", durationMinutes: 60, price: 50 };
const providerName = instructor.fullName ?? instructor.name ?? "Demo Provider";

const CLIENTS = [
  {
    id: "demo-client-customer",
    userId: customerUid,
    name: "Demo Customer",
    email: "demo.customer@vitfitdemo.dev",
    phone: "+39 333 000 0001",
    tags: ["dimagrimento", "principiante"],
    notes: "Obiettivo: perdere 5 kg entro l'estate. Ginocchio destro delicato, evitare salti.",
    firstVisitDays: -45,
    full: true,
  },
  {
    id: "demo-client-giulia",
    userId: "demo-client-user-giulia",
    name: "Giulia Bianchi",
    email: "giulia.bianchi@vitfitdemo.dev",
    phone: "+39 347 111 2233",
    tags: ["forza"],
    notes: "Preparazione per la mezza maratona di primavera.",
    firstVisitDays: -90,
  },
  {
    id: "demo-client-luca",
    userId: "demo-client-user-luca",
    name: "Luca Verdi",
    email: "luca.verdi@vitfitdemo.dev",
    phone: "+39 320 444 5566",
    tags: [],
    notes: "",
    firstVisitDays: -20,
  },
];

// offsetDays -> status: history, a paid one, a cancellation, an upcoming slot, a pending request.
const TIMELINE = [
  { offsetDays: -30, status: "completed" },
  { offsetDays: -14, status: "payment_confirmed" },
  { offsetDays: -7, status: "cancelled_by_client" },
  { offsetDays: 3, status: "accepted" },
  { offsetDays: 10, status: "requested" },
];

function bookingDoc(client, i, { offsetDays, status }) {
  const id = `demo-booking-${client.id}-${i + 1}`;
  const scheduled = at(offsetDays, 9 + i);
  const paid = status === "completed" || status === "payment_confirmed";
  const cancelled = status === "cancelled_by_client";
  const now = Timestamp.now();
  return [id, {
    id,
    // D5: demo bookings never count in a stat or metric.
    isDemo: true,
    userId: client.userId,
    userName: client.name,
    userPhone: client.phone,
    userEmail: client.email,
    instructorId: providerUid,
    instructorName: providerName,
    venueId: null, venueName: null, venueAddress: null,
    serviceId: service.id,
    serviceName: service.name,
    bookingType: "home_service",
    serviceAddress: { street: "Via Roma 12", city: "Milano", postalCode: "20121", location: new admin.firestore.GeoPoint(45.4642, 9.19) },
    scheduledAt: scheduled,
    scheduledEndAt: Timestamp.fromMillis(scheduled.toMillis() + (service.durationMinutes ?? 60) * 60000),
    durationMinutes: service.durationMinutes ?? 60,
    status,
    originalPrice: service.price ?? 50,
    discountAmount: 0, homeServiceFee: 0,
    finalPrice: service.price ?? 50,
    depositAmount: 0, depositPaid: false,
    pointsEarned: paid ? Math.floor(service.price ?? 50) : 0,
    pointsUsed: 0, pointsValue: 0,
    promotionId: null, promotionCode: null,
    paymentStatus: paid ? "paid" : "pending",
    paymentMethod: paid ? "cash" : null,
    stripePaymentIntentId: null,
    userNotes: null, internalNotes: null,
    cancelledAt: cancelled ? at(offsetDays - 1) : null,
    cancelledBy: cancelled ? "user" : null,
    cancellationReason: cancelled ? "Imprevisto personale" : null,
    refundAmount: null,
    statusHistory: [{ status, actorUid: "seed", actorRole: "system", at: now, note: "demo seed" }],
    lateCancellation: false,
    paymentConfirmation: status === "payment_confirmed"
      ? { amount: service.price ?? 50, method: "cash", recordedAt: at(offsetDays), recordedBy: providerUid, clientResponse: "confirmed", respondedAt: at(offsetDays) }
      : null,
    createdAt: at(offsetDays - 5),
    updatedAt: now,
  }];
}

const PUBLISHED_PROGRAM = {
  title: "Rimessa in forma — 4 settimane",
  goal: "Perdere peso e migliorare la resistenza",
  durationWeeks: 4,
  daysPerWeek: 3,
  source: "manual",
  status: "published",
  medicalClearanceNote: null,
  weeks: [1, 2, 3, 4].map((weekNumber) => ({
    weekNumber,
    days: [
      { label: "Giorno A", focus: "Parte inferiore", exercises: [
        { name: "Squat a corpo libero", sets: 3, reps: `${10 + weekNumber}`, restSec: 60 },
        { name: "Affondi alternati", sets: 3, reps: "10 per gamba", restSec: 60 },
        { name: "Ponte glutei", sets: 3, reps: "15", restSec: 45, notes: "Senza salti: ginocchio destro." },
      ] },
      { label: "Giorno B", focus: "Parte superiore", exercises: [
        { name: "Push-up sulle ginocchia", sets: 3, reps: "8-12", restSec: 60 },
        { name: "Rematore con elastico", sets: 3, reps: "12", restSec: 60 },
        { name: "Plank", sets: 3, reps: "30s", restSec: 45 },
      ] },
      { label: "Giorno C", focus: "Cardio", exercises: [
        { name: "Camminata veloce", sets: 1, reps: `${20 + weekNumber * 5} min`, loadNote: "Ritmo conversazionale" },
      ] },
    ],
  })),
};

const DRAFT_PROGRAM = {
  title: "Forza base — bozza",
  goal: "Aumentare la forza generale",
  durationWeeks: 2,
  daysPerWeek: 2,
  source: "manual",
  status: "draft",
  medicalClearanceNote: null,
  weeks: [1, 2].map((weekNumber) => ({
    weekNumber,
    days: [{ label: "Giorno A", focus: "Total body", exercises: [
      { name: "Stacco rumeno con manubri", sets: 4, reps: "8", restSec: 90, tempo: "3-1-1" },
      { name: "Panca con manubri", sets: 4, reps: "8", restSec: 90 },
    ] }],
  })),
};

const GOALS = [
  { id: "goal-weight", type: "weight_loss", description: "Perdere 5 kg", targetValue: 5, unit: "kg", targetDays: 90, status: "active" },
  { id: "goal-endurance", type: "endurance", description: "Correre 5 km senza fermarsi", targetDays: 60, status: "active" },
  { id: "goal-mobility", type: "mobility", description: "Toccare le punte dei piedi", targetDays: -5, status: "achieved" },
];

const RECIPES = [
  {
    id: "demo-recipe-overnight-oats",
    title: "Overnight oats proteici",
    servings: 1, prepMinutes: 5, cookMinutes: 0,
    ingredients: [{ item: "Fiocchi d'avena", quantity: "50 g" }, { item: "Yogurt greco", quantity: "150 g" }, { item: "Frutti di bosco", quantity: "80 g" }, { item: "Miele", quantity: "1 cucchiaino" }],
    steps: ["Mescola avena e yogurt in un barattolo.", "Aggiungi i frutti di bosco e il miele.", "Lascia in frigo tutta la notte."],
    nutritionPerServing: { kcal: 380, proteinG: 24, carbsG: 52, fatG: 7 },
    tags: ["colazione", "proteico"],
    shareWithCustomer: true,
  },
  {
    id: "demo-recipe-pollo-verdure",
    title: "Pollo al forno con verdure",
    servings: 2, prepMinutes: 15, cookMinutes: 35,
    ingredients: [{ item: "Petto di pollo", quantity: "300 g" }, { item: "Zucchine", quantity: "2" }, { item: "Peperoni", quantity: "1" }, { item: "Olio EVO", quantity: "1 cucchiaio" }],
    steps: ["Taglia pollo e verdure a cubetti.", "Condisci con olio, sale e rosmarino.", "Inforna a 200°C per 35 minuti."],
    nutritionPerServing: { kcal: 420, proteinG: 45, carbsG: 14, fatG: 18 },
    tags: ["pranzo", "cena"],
    shareWithCustomer: false,
  },
];

let writes = 0;
const batch = db.batch();
const set = (ref, data) => { batch.set(ref, data, { merge: true }); writes++; };

for (const c of CLIENTS) {
  const clientRef = db.collection("clients").doc(c.id);
  const bookings = TIMELINE.map((t, i) => bookingDoc(c, i, t));
  const completed = TIMELINE.filter((t) => ["completed", "payment_confirmed"].includes(t.status)).length;
  set(clientRef, {
    isDemo: true,
    providerId: providerUid,
    userId: c.userId,
    name: c.name,
    email: c.email,
    phone: c.phone,
    photoUrl: "",
    tags: c.tags,
    notes: c.notes,
    totalBookings: bookings.length,
    totalSpent: completed * (service.price ?? 50),
    firstVisit: at(c.firstVisitDays),
    lastVisit: at(-14),
    createdAt: at(c.firstVisitDays),
    updatedAt: FieldValue.serverTimestamp(),
  });
  for (const [id, data] of bookings) set(db.collection("bookings").doc(id), data);

  set(clientRef.collection("notes").doc("note-1"), {
    content: `Prima valutazione: ${c.notes || "nessuna controindicazione."}`,
    createdBy: providerUid, createdAt: at(c.firstVisitDays), updatedAt: at(c.firstVisitDays),
  });

  const goals = c.full ? GOALS : GOALS.slice(0, 1);
  for (const g of goals) {
    set(clientRef.collection("goals").doc(g.id), {
      type: g.type, description: g.description,
      ...(g.targetValue != null ? { targetValue: g.targetValue, unit: g.unit } : {}),
      targetDate: at(g.targetDays), status: g.status,
      createdBy: providerUid, createdAt: at(c.firstVisitDays + 1), updatedAt: Timestamp.now(),
    });
  }

  if (c.full || c.id === "demo-client-giulia") {
    const programs = c.full ? [["program-published", PUBLISHED_PROGRAM, -10], ["program-draft", DRAFT_PROGRAM, -2]] : [["program-draft", DRAFT_PROGRAM, -3]];
    for (const [pid, p, days] of programs) {
      set(clientRef.collection("trainingPrograms").doc(pid), { ...p, createdBy: providerUid, createdAt: at(days), updatedAt: at(days) });
    }
  }
  if (c.full) {
    // One completed day, so the customer's progress UI has state to show.
    set(clientRef.collection("planProgress").doc("program-published__w1__Giorno_A"), {
      planId: "program-published", weekNumber: 1, dayLabel: "Giorno A",
      exercises: { 0: { done: true, actualReps: "11" }, 1: { done: true }, 2: { done: true } },
      rpe: 6, completedAt: at(-8), updatedAt: at(-8),
    });
  }
}

for (const r of RECIPES) {
  const { id, shareWithCustomer, ...recipe } = r;
  set(db.collection("recipes").doc(id), {
    ...recipe,
    source: "manual",
    ownerUid: providerUid,
    ownerRole: "provider",
    sharedWithUserIds: shareWithCustomer ? [customerUid] : [],
    createdAt: at(-12),
    updatedAt: Timestamp.now(),
  });
}

await batch.commit();
console.log(`project: ${project ?? "emulator"}  provider: ${providerUid}  customer: ${customerUid}`);
console.log(`clients: ${CLIENTS.length}  bookings: ${CLIENTS.length * TIMELINE.length}  recipes: ${RECIPES.length}  writes: ${writes}`);
