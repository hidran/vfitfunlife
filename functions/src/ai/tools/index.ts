import { tool } from "ai";
import { z } from "zod";
import * as admin from "firebase-admin";
import { ResultCard } from "../types";
import { matchesAvailability, formatSlotLabel } from "../search/match";
import { normalizeAvailability } from "../search/normalize";
import { instructorDocToCard } from "../search/mapCards";

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
      // NOTE: the `.limit(50)` pre-filter caps how many verified+active
      // instructors we scan. In-loop city/specialty/time filters run on those
      // 50 raw docs, so matches beyond the first 50 verified+active docs may be
      // missed. Acceptable for the current catalog size; revisit (paginate or
      // narrow the server-side query) if the instructors collection grows large.
      const snap = await db()
        .collection("instructors")
        .where("isVerified", "==", true)
        .where("isActive", "==", true)
        .limit(50)
        .get();

      const cards: ResultCard[] = [];
      for (const doc of snap.docs) {
        const data = doc.data() as Record<string, any>;
        // Defense in depth: the mock `where` is a passthrough and prod data may
        // be inconsistent, so re-assert the verified/active gate in the loop.
        if (data.isVerified !== true || data.isActive !== true) continue;
        // VFun activity docs (events, parties, VR) share the `instructors`
        // collection but are never searchable providers — exclude them even if
        // their verified/active flags happen to be set.
        if (data.activityKind) continue;

        if (args.city && !cityEq(data.city, args.city)) continue;
        if (args.specialty) {
          const specs: string[] = Array.isArray(data.specialties) ? data.specialties : [];
          const needle = args.specialty.toLowerCase();
          const hit = specs.some((s) => typeof s === "string" && s.toLowerCase().includes(needle)) ||
            (typeof data.userType === "string" && data.userType.toLowerCase().includes(needle));
          if (!hit) continue;
        }
        if (args.language) {
          const langs: string[] = Array.isArray(data.languages) ? data.languages : [];
          if (!langs.map((l) => String(l).toLowerCase()).includes(args.language.toLowerCase())) continue;
        }
        if (typeof args.priceMax === "number" && typeof data.hourlyRate === "number" && data.hourlyRate > args.priceMax) continue;

        // Availability is BEST-EFFORT: if an instructor has no parseable
        // availability, include them without time gating (so results aren't
        // empty) and omit matchingSlots; otherwise apply the time filter.
        const slots = normalizeAvailability(data.availabilitySchedule);
        let matchingSlots: string[] | undefined;
        if (typeof args.dayOfWeek === "number" && slots.length > 0) {
          if (!matchesAvailability(slots, args.dayOfWeek, args.startTime, args.endTime)) continue;
          matchingSlots = slots
            .filter((s) => s.dayOfWeek === args.dayOfWeek && s.isAvailable !== false)
            .map((s) => formatSlotLabel(s.dayOfWeek, s.startTime, s.endTime));
        }
        cards.push(instructorDocToCard(doc.id, data, matchingSlots));
        if (cards.length >= (args.limit ?? DEFAULT_LIMIT)) break;
      }
      return cards;
    },
  });

  const searchClasses = tool({
    description: "Search fitness classes by city and section.",
    // TODO: schedule filtering (dayOfWeek / startTime / endTime) requires the
    // `/schedules` subcollection, which isn't wired up yet. Until then we do not
    // advertise those params to the LLM so it can't promise filters we can't honor.
    inputSchema: z.object({
      city: z.string().optional(),
      section: z.enum(["fit", "fun", "life"]).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    }),
    execute: async (args): Promise<ResultCard[]> => {
      let q: FirebaseFirestore.Query = db().collection("fitnessClasses");
      if (args.section) q = q.where("section", "==", args.section);
      const snap = await q.limit(50).get();
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
    execute: async ({ providerId }): Promise<{ slots: string[]; error?: string }> => {
      const doc = await db().collection("instructors").doc(providerId).get();
      if (!doc.exists) return { slots: [], error: "provider_not_found" };
      const slots = normalizeAvailability(doc.data()?.availabilitySchedule);
      return {
        slots: slots
          .filter((s) => s.isAvailable !== false)
          .map((s) => formatSlotLabel(s.dayOfWeek, s.startTime, s.endTime)),
      };
    },
  });

  return { searchProviders, searchClasses, searchVenues, getProviderAvailability };
}
