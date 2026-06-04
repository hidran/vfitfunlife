import { tool } from "ai";
import { z } from "zod";
import * as admin from "firebase-admin";
import { ResultCard } from "../types";
import { matchesAvailability, formatSlotLabel, AvailabilitySlot } from "../search/match";
import { providerDocToCard } from "../search/mapCards";

const DEFAULT_LIMIT = 8;

function cityEq(a: unknown, b: string): boolean {
  return typeof a === "string" && a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Build the read-only tool set. Pass nothing in prod; tests mock firebase-admin. */
export function createAiTools() {
  const db = () => admin.firestore();

  const searchProviders = tool({
    description:
      "Search verified personal trainers / providers by specialty, city, day and time window. " +
      "Use when the user wants a person (e.g. a personal trainer) at a place and time.",
    inputSchema: z.object({
      city: z.string().optional().describe("City name, e.g. 'Torino'"),
      specialty: z.string().optional().describe("Specialty / userType, e.g. 'Personal Training'"),
      language: z.string().optional(),
      dayOfWeek: z.number().int().min(0).max(6).optional().describe("0=Sunday .. 6=Saturday"),
      startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().describe("HH:MM 24h"),
      endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().describe("HH:MM 24h"),
      priceMax: z.number().optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    execute: async (args): Promise<ResultCard[]> => {
      const snap = await db()
        .collection("users")
        .where("role", "==", "provider")
        .where("isVerified", "==", true)
        .limit(50)
        .get();

      const cards: ResultCard[] = [];
      for (const doc of snap.docs) {
        const data = doc.data() as Record<string, any>;
        const pp = data.providerProfile ?? {};
        if (args.city && !cityEq(pp.serviceArea?.city, args.city)) continue;
        if (args.specialty) {
          const specs: string[] = Array.isArray(pp.specialties) ? pp.specialties : [];
          const hit = specs.some((s) => s.toLowerCase().includes(args.specialty!.toLowerCase())) ||
            (typeof data.userType === "string" && data.userType.toLowerCase().includes(args.specialty!.toLowerCase()));
          if (!hit) continue;
        }
        if (args.language) {
          const langs: string[] = Array.isArray(pp.languages) ? pp.languages : [];
          if (!langs.map((l) => l.toLowerCase()).includes(args.language.toLowerCase())) continue;
        }
        if (typeof args.priceMax === "number" && typeof pp.hourlyRate === "number" && pp.hourlyRate > args.priceMax) continue;

        const schedule: AvailabilitySlot[] = Array.isArray(pp.availabilitySchedule) ? pp.availabilitySchedule : [];
        let matchingSlots: string[] | undefined;
        if (typeof args.dayOfWeek === "number") {
          if (!matchesAvailability(schedule, args.dayOfWeek, args.startTime, args.endTime)) continue;
          matchingSlots = schedule
            .filter((s) => s.dayOfWeek === args.dayOfWeek && s.isAvailable !== false)
            .map((s) => formatSlotLabel(s.dayOfWeek, s.startTime, s.endTime));
        }
        cards.push(providerDocToCard(doc.id, data, matchingSlots));
        if (cards.length >= (args.limit ?? DEFAULT_LIMIT)) break;
      }
      return cards;
    },
  });

  const searchClasses = tool({
    description: "Search fitness classes by city, day and time window.",
    inputSchema: z.object({
      city: z.string().optional(),
      dayOfWeek: z.number().int().min(0).max(6).optional(),
      startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    execute: async (args): Promise<ResultCard[]> => {
      const snap = await db().collection("fitnessClasses").limit(50).get();
      const cards: ResultCard[] = [];
      for (const doc of snap.docs) {
        const data = doc.data() as Record<string, any>;
        if (args.city && !cityEq(data.city, args.city)) continue;
        cards.push({
          kind: "class",
          id: doc.id,
          title: data.name ?? data.title ?? "Class",
          subtitle: data.venueName ?? undefined,
          imageUrl: data.imageUrl ?? undefined,
          bookingHref: `/book?classId=${doc.id}`,
        });
        if (cards.length >= (args.limit ?? DEFAULT_LIMIT)) break;
      }
      return cards;
    },
  });

  const searchVenues = tool({
    description: "Search gyms / wellness centers / venues by city and type.",
    inputSchema: z.object({
      city: z.string().optional(),
      type: z.enum(["gym", "wellness_center", "beauty_salon", "outdoor_space"]).optional(),
      section: z.enum(["fit", "fun", "life"]).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    execute: async (args): Promise<ResultCard[]> => {
      let q: FirebaseFirestore.Query = db().collection("venues");
      if (args.type) q = q.where("type", "==", args.type);
      if (args.section) q = q.where("section", "==", args.section);
      const snap = await q.limit(50).get();
      const cards: ResultCard[] = [];
      for (const doc of snap.docs) {
        const data = doc.data() as Record<string, any>;
        if (args.city && !cityEq(data.city, args.city)) continue;
        cards.push({
          kind: "venue",
          id: doc.id,
          title: data.name ?? "Venue",
          subtitle: data.address ?? undefined,
          imageUrl: data.imageUrl ?? data.coverImageUrl ?? undefined,
          bookingHref: `/book?venueId=${doc.id}`,
        });
        if (cards.length >= (args.limit ?? DEFAULT_LIMIT)) break;
      }
      return cards;
    },
  });

  const getProviderAvailability = tool({
    description: "Get the weekly availability slots for one provider, to confirm a specific time.",
    inputSchema: z.object({ providerId: z.string() }),
    execute: async ({ providerId }): Promise<{ slots: string[] }> => {
      const doc = await db().collection("users").doc(providerId).get();
      const pp = (doc.data()?.providerProfile ?? {}) as Record<string, any>;
      const schedule: AvailabilitySlot[] = Array.isArray(pp.availabilitySchedule) ? pp.availabilitySchedule : [];
      return { slots: schedule.filter((s) => s.isAvailable !== false).map((s) => formatSlotLabel(s.dayOfWeek, s.startTime, s.endTime)) };
    },
  });

  return { searchProviders, searchClasses, searchVenues, getProviderAvailability };
}
