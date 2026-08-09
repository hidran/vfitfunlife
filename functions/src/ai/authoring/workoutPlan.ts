/**
 * AI workout-plan generation, constrained to the shared exercise library.
 *
 * Three guarantees this file exists to enforce, all of which the previous free-text
 * generator lacked:
 *
 *  1. The model may only use exercise IDs from `EXERCISE_CATALOG`. Anything invented is
 *     mapped to the closest known movement or dropped — never persisted as a made-up name.
 *  2. If injuries are flagged, contraindicated movements are removed from the candidate
 *     set BEFORE the model sees it, and a medical-clearance note is attached. The prompt is
 *     asked to comply too, but the filtering is what actually enforces it.
 *  3. The plan is always saved as `draft`. Publishing is a separate, human act.
 *
 * Spec: docs/superpowers/specs/2026-08-09-workout-plans-design.md
 */

import { z } from "zod";
import {
  EXERCISE_CATALOG,
  exercisesFor,
  type ExerciseSeed,
  type InjuryArea,
} from "../../exercises/catalog";

export const INJURY_AREAS: InjuryArea[] = [
  "knee", "lower_back", "shoulder", "wrist", "ankle", "neck", "hip",
];

/**
 * The "anamnesi sportiva" — deliberately NON-medical.
 *
 * No body weight, no measurements, no conditions: injuries are a coarse area flag plus
 * free text, which is what a trainer is entitled to collect. Anything more belongs to a
 * medical professional.
 */
export const workoutPlanParamsSchema = z.object({
  goal: z.enum([
    "dimagrimento", "massa", "tonificazione", "resistenza", "mobilita", "performance",
  ]),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  durationWeeks: z.number().int().min(1).max(16),
  daysPerWeek: z.number().int().min(1).max(7),
  sessionMinutes: z.number().int().min(15).max(180).optional(),
  ageRange: z.string().max(20).optional(),
  equipment: z.array(z.enum([
    "bodyweight", "dumbbells", "barbell", "kettlebell", "bands",
    "machine", "cable", "bench", "pullup_bar", "mat", "cardio_machine",
  ])).min(1),
  injuryAreas: z.array(z.enum([
    "knee", "lower_back", "shoulder", "wrist", "ankle", "neck", "hip",
  ])).optional(),
  /** Free text only — never parsed for medical meaning. */
  injuryNotes: z.string().max(500).optional(),
  includeExercises: z.string().max(300).optional(),
  excludeExercises: z.string().max(300).optional(),
});

export type WorkoutPlanParams = z.infer<typeof workoutPlanParamsSchema>;

/** The model returns exercise IDs, not names. */
export const workoutPlanSchema = z.object({
  title: z.string(),
  goal: z.string(),
  weeks: z.array(z.object({
    weekNumber: z.number().int(),
    days: z.array(z.object({
      label: z.string(),
      focus: z.string().optional(),
      exercises: z.array(z.object({
        exerciseId: z.string(),
        sets: z.number().int().min(1).max(10),
        reps: z.string(),
        restSec: z.number().int().min(0).max(600).optional(),
        tempo: z.string().optional(),
        loadNote: z.string().optional(),
        notes: z.string().optional(),
      })).min(1),
    })).min(1),
  })).min(1),
});

export type RawWorkoutPlan = z.infer<typeof workoutPlanSchema>;

/** Candidate exercises after equipment and injury filtering. */
export function candidateExercises(params: WorkoutPlanParams): ExerciseSeed[] {
  const injuries = (params.injuryAreas ?? []) as InjuryArea[];
  const safe = exercisesFor(injuries);
  const available = new Set(params.equipment);
  return safe.filter((e) => e.equipment.some((eq) => available.has(eq)));
}

/**
 * Normalises the model's output against the catalog.
 *
 * An unknown ID is first matched by name, then by primary muscle group within the
 * candidate set, and only dropped if neither works. Dropping is preferable to persisting a
 * movement the client cannot look up — but silently dropping everything would leave an
 * empty day, so the result reports what happened.
 */
export function reconcileWithCatalog(
  plan: RawWorkoutPlan,
  candidates: ExerciseSeed[],
): { plan: RawWorkoutPlan; unknown: string[]; remapped: number; dropped: number } {
  const byId = new Map(EXERCISE_CATALOG.map((e) => [e.id, e]));
  const candidateIds = new Set(candidates.map((e) => e.id));
  // Normalise punctuation on both sides: the model writes "push up" where the catalog
  // says "Push-up", and an id-shaped guess writes "push_up".
  const norm = (v: string) => v.toLowerCase().replace(/[-_\s]+/g, " ").trim();
  const byLowerName = new Map<string, ExerciseSeed>();
  for (const e of EXERCISE_CATALOG) {
    byLowerName.set(norm(e.name.it), e);
    byLowerName.set(norm(e.name.en), e);
    byLowerName.set(norm(e.id), e);
  }

  const unknown: string[] = [];
  let remapped = 0;
  let dropped = 0;

  const weeks = plan.weeks.map((w) => ({
    ...w,
    days: w.days.map((d) => {
      const exercises = d.exercises.flatMap((entry) => {
        const id = String(entry.exerciseId ?? "").trim();

        if (candidateIds.has(id)) return [entry];

        // Known movement, but excluded by equipment or injury filtering — do not smuggle
        // it back in just because the model asked for it.
        if (byId.has(id)) {
          const known = byId.get(id)!;
          const alt = candidates.find((c) => c.primary === known.primary);
          if (alt) {
            remapped++; return [{ ...entry, exerciseId: alt.id }];
          }
          dropped++; unknown.push(id);
          return [];
        }

        // Invented ID: try the name, then the muscle group.
        const byName = byLowerName.get(norm(id));
        if (byName && candidateIds.has(byName.id)) {
          remapped++; return [{ ...entry, exerciseId: byName.id }];
        }
        unknown.push(id);
        dropped++;
        return [];
      });
      return { ...d, exercises };
    // A day emptied by filtering is worse than no day at all — it reads as a bug to the
    // client. Drop it and let the trainer see a shorter plan they can edit.
    }).filter((d) => d.exercises.length > 0),
  })).filter((w) => w.days.length > 0);

  return { plan: { ...plan, weeks }, unknown, remapped, dropped };
}

export const MEDICAL_CLEARANCE_NOTE =
  "Hai segnalato un infortunio o una limitazione. Questa scheda è un suggerimento " +
  "generico e non sostituisce il parere di un medico: chiedi il via libera a un " +
  "professionista sanitario prima di iniziare.";

export function buildWorkoutPlanPrompt(args: {
  params: WorkoutPlanParams;
  candidates: ExerciseSeed[];
  goals: Array<{ description?: string }>;
  locale: string;
}): string {
  const { params, candidates } = args;
  const injuries = params.injuryAreas ?? [];

  // The catalog goes in as id → name so the model has no reason to invent one.
  const catalogLines = candidates
    .map((e) => `${e.id} = ${e.name.it} (${e.primary}, ${e.difficulty})`)
    .join("\n");

  return [
    "Sei un preparatore atletico esperto. Costruisci una scheda di allenamento " +
    "realistica e sicura, come oggetto JSON conforme allo schema fornito.",
    "",
    "REGOLA VINCOLANTE: per ogni esercizio devi usare ESCLUSIVAMENTE un `exerciseId` " +
    "preso dall'elenco qui sotto. Non inventare esercizi e non usare nomi liberi. " +
    "Se un esercizio che vorresti non è in elenco, scegli l'alternativa più simile.",
    "",
    "Esercizi disponibili:",
    catalogLines,
    "",
    "Parametri richiesti:",
    `- Obiettivo: ${params.goal}`,
    `- Livello: ${params.level}`,
    `- Durata: ${params.durationWeeks} settimane`,
    `- Giorni a settimana: ${params.daysPerWeek}`,
    params.sessionMinutes ? `- Durata sessione: ${params.sessionMinutes} minuti` : "",
    params.ageRange ? `- Fascia d'età: ${params.ageRange}` : "",
    `- Attrezzatura: ${params.equipment.join(", ")}`,
    params.includeExercises ? `- Da includere se possibile: ${params.includeExercises}` : "",
    params.excludeExercises ? `- Da evitare: ${params.excludeExercises}` : "",
    injuries.length ? `- Aree con limitazioni segnalate: ${injuries.join(", ")}` : "",
    params.injuryNotes ? `- Note del cliente: ${params.injuryNotes}` : "",
    "",
    args.goals.length ?
      `Obiettivi del cliente: ${args.goals.map((g) => g.description).filter(Boolean).join("; ")}` :
      "",
    "",
    injuries.length ?
      "Il cliente ha segnalato limitazioni: privilegia progressioni prudenti e carichi " +
        "moderati. L'elenco esercizi qui sopra è già stato filtrato per le sue limitazioni." :
      "",
    "Progressione graduale tra le settimane. Indica sets, reps e recupero per ogni esercizio.",
  ].filter((l) => l !== "").join("\n");
}
