import {
  collection, doc, addDoc, updateDoc, deleteDoc, getDocs, query, orderBy, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db, auth } from "./config";
import type { ClientGoal, TrainingProgram, DietPlan, Recipe } from "@/types/clientPlans";

const CLIENTS = "clients";

function uid(): string {
  const u = auth.currentUser?.uid;
  if (!u) throw new Error("Not authenticated");
  return u;
}

function toIso(v: unknown): string | undefined {
  return v instanceof Timestamp ? v.toDate().toISOString() : undefined;
}

// ---- Goals ----
export async function listGoals(clientId: string): Promise<ClientGoal[]> {
  const snap = await getDocs(query(collection(db, CLIENTS, clientId, "goals"), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, ...data, targetDate: toIso(data.targetDate) ?? null, createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt) } as ClientGoal;
  });
}
export async function createGoal(clientId: string, goal: Omit<ClientGoal, "id" | "createdBy" | "createdAt" | "updatedAt">): Promise<string> {
  const ref = await addDoc(collection(db, CLIENTS, clientId, "goals"), {
    ...goal,
    targetDate: goal.targetDate ? Timestamp.fromDate(new Date(goal.targetDate)) : null,
    createdBy: uid(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}
export async function updateGoal(clientId: string, goalId: string, patch: Partial<ClientGoal>): Promise<void> {
  const { id, createdBy, createdAt, ...rest } = patch;
  await updateDoc(doc(db, CLIENTS, clientId, "goals", goalId), {
    ...rest,
    ...(rest.targetDate !== undefined ? { targetDate: rest.targetDate ? Timestamp.fromDate(new Date(rest.targetDate)) : null } : {}),
    updatedAt: serverTimestamp(),
  });
}
export async function deleteGoal(clientId: string, goalId: string): Promise<void> {
  await deleteDoc(doc(db, CLIENTS, clientId, "goals", goalId));
}

// ---- Generic plan CRUD (training / diet / recipes) ----
type PlanKind = "trainingPrograms" | "dietPlans" | "recipes";
async function listPlans<T>(clientId: string, kind: PlanKind): Promise<T[]> {
  const snap = await getDocs(query(collection(db, CLIENTS, clientId, kind), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, ...data, createdAt: toIso(data.createdAt), updatedAt: toIso(data.updatedAt) } as T;
  });
}
async function createPlan(clientId: string, kind: PlanKind, plan: Record<string, unknown>): Promise<string> {
  const ref = await addDoc(collection(db, CLIENTS, clientId, kind), {
    ...plan, source: "manual", createdBy: uid(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}
async function updatePlan(clientId: string, kind: PlanKind, id: string, patch: Record<string, unknown>): Promise<void> {
  const { id: _i, createdBy: _c, createdAt: _ca, source: _s, ...rest } = patch as Record<string, unknown>;
  await updateDoc(doc(db, CLIENTS, clientId, kind, id), { ...rest, updatedAt: serverTimestamp() });
}
async function deletePlan(clientId: string, kind: PlanKind, id: string): Promise<void> {
  await deleteDoc(doc(db, CLIENTS, clientId, kind, id));
}

export const listTrainingPrograms = (c: string) => listPlans<TrainingProgram>(c, "trainingPrograms");
export const createTrainingProgram = (c: string, p: Omit<TrainingProgram, "id" | "source" | "createdBy" | "createdAt" | "updatedAt">) => createPlan(c, "trainingPrograms", p);
export const updateTrainingProgram = (c: string, id: string, p: Partial<TrainingProgram>) => updatePlan(c, "trainingPrograms", id, p);
export const deleteTrainingProgram = (c: string, id: string) => deletePlan(c, "trainingPrograms", id);

export const listDietPlans = (c: string) => listPlans<DietPlan>(c, "dietPlans");
export const createDietPlan = (c: string, p: Omit<DietPlan, "id" | "source" | "createdBy" | "createdAt" | "updatedAt">) => createPlan(c, "dietPlans", p);
export const updateDietPlan = (c: string, id: string, p: Partial<DietPlan>) => updatePlan(c, "dietPlans", id, p);
export const deleteDietPlan = (c: string, id: string) => deletePlan(c, "dietPlans", id);

export const listRecipes = (c: string) => listPlans<Recipe>(c, "recipes");
export const createRecipe = (c: string, p: Omit<Recipe, "id" | "source" | "createdBy" | "createdAt" | "updatedAt">) => createPlan(c, "recipes", p);
export const updateRecipe = (c: string, id: string, p: Partial<Recipe>) => updatePlan(c, "recipes", id, p);
export const deleteRecipe = (c: string, id: string) => deletePlan(c, "recipes", id);
