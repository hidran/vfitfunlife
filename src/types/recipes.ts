// src/types/recipes.ts
// Mirrors functions/src/recipes/schema.ts. Keep the two in step.

export const DIET_STYLES = ['onnivora', 'vegetariana', 'vegana', 'pescetariana'] as const;
export const EXCLUSIONS = ['glutine', 'lattosio', 'frutta_secca', 'uova', 'crostacei', 'soia'] as const;
export const ORIENTATIONS = [
  'ricche_di_proteine', 'piatti_leggeri', 'piatto_unico',
  'colazione', 'spuntino', 'pre_allenamento', 'post_allenamento',
] as const;
export const CUISINES = ['italiana', 'mediterranea', 'asiatica', 'mediorientale', 'messicana', 'qualsiasi'] as const;
export const BUDGETS = ['economico', 'medio', 'qualsiasi'] as const;
export const PREP_TIMES = [15, 30, 45, 60] as const;

export type DietStyle = (typeof DIET_STYLES)[number];
export type Exclusion = (typeof EXCLUSIONS)[number];
export type Orientation = (typeof ORIENTATIONS)[number];
export type Cuisine = (typeof CUISINES)[number];
export type Budget = (typeof BUDGETS)[number];
export type PrepTime = (typeof PREP_TIMES)[number];

export interface RecipeIngredient { item: string; quantity: string }
export interface NutritionPerServing { kcal?: number; protein?: number; carbs?: number; fat?: number }

export interface RecipeParams {
  count: number;
  servings: number;
  dietStyle: DietStyle;
  excludes: Exclusion[];
  orientation: Orientation;
  cuisine: Cuisine;
  maxPrepMinutes: PrepTime;
  budget: Budget;
  ingredientsOnHand?: string[];
}

export interface Recipe {
  id: string;
  title: string;
  servings: number;
  prepMinutes: number;
  cookMinutes?: number;
  ingredients: RecipeIngredient[];
  steps: string[];
  nutritionPerServing?: NutritionPerServing;
  tags: string[];
  params?: Omit<RecipeParams, 'count' | 'servings' | 'ingredientsOnHand'>;
  source: 'ai' | 'manual';
  model?: string;
  /** Who generated it. There is deliberately no clientId — a recipe is not addressed to anyone. */
  ownerUid: string;
  ownerRole: 'provider' | 'client' | 'admin';
  sharedWithUserIds: string[];
  createdAt?: string;
  updatedAt?: string;
}
