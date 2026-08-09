import type { z } from "zod";
import { localeLanguage } from "../../lib/locale";
import type { trainingParamsSchema } from "./schemas";

export type TrainingParams = z.infer<typeof trainingParamsSchema>;

/** Minimal goal shape the prompt builders rely on (subset of ClientGoal). */
export interface ClientGoalLite {
  type?: string;
  description?: string;
  targetValue?: number;
  unit?: string;
}

export interface PromptContext<P> {
  locale: string;
  params: P;
  goals: ClientGoalLite[];
  recentSessions: string[];
}

const DISCLAIMER =
  "Include a brief note that this plan is general fitness/wellness guidance, not medical advice, " +
  "and the client should consult a qualified professional for medical conditions.";

function goalsBlock(goals: ClientGoalLite[]): string {
  if (!goals.length) return "No specific goals recorded.";
  return goals
    .map((g) => {
      const target = g.targetValue != null ? ` (target: ${g.targetValue}${g.unit ? ` ${g.unit}` : ""})` : "";
      return `- ${g.type ?? "goal"}: ${g.description ?? ""}${target}`.trim();
    })
    .join("\n");
}

function sessionsBlock(recentSessions: string[]): string {
  if (!recentSessions.length) return "No recent training history available.";
  return recentSessions.map((s) => `- ${s}`).join("\n");
}

function header(locale: string, goals: ClientGoalLite[], recentSessions: string[]): string {
  return [
    `Write the entire output in ${localeLanguage(locale)}.`,
    "",
    "Client active goals:",
    goalsBlock(goals),
    "",
    "Recent completed sessions:",
    sessionsBlock(recentSessions),
  ].join("\n");
}

export function buildTrainingPrompt(ctx: PromptContext<TrainingParams>): string {
  const { params } = ctx;
  const lines = [
    "You are an expert fitness coach. Produce a realistic, safe, well-structured " +
      "training program as a JSON object matching the provided schema.",
    "",
    header(ctx.locale, ctx.goals, ctx.recentSessions),
    "",
    "Requested parameters:",
    params.focus ? `- Focus: ${params.focus}` : "",
    `- Duration: ${params.durationWeeks} weeks`,
    `- Days per week: ${params.daysPerWeek}`,
    params.sessionMinutes ? `- Session length: ${params.sessionMinutes} minutes` : "",
    params.level ? `- Level: ${params.level}` : "",
    params.equipment ? `- Available equipment: ${params.equipment}` : "",
    params.constraints ? `- Constraints/injuries: ${params.constraints}` : "",
    "",
    "Respect the client's goals and recent sessions. Use safe progressions " +
      "appropriate to the stated level and constraints.",
    DISCLAIMER + " Put this note in an exercise `notes` field on the first day.",
  ];
  return lines.filter((l) => l !== "").join("\n");
}
