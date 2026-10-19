import type { CategoryDoc } from "./tree";

export type StoredCategoryDefaults = Pick<
  CategoryDoc,
  "parentId" | "names" | "icon" | "sections" | "order" | "isActive"
>;

export type ExistingStoredCategory = Partial<Omit<StoredCategoryDefaults, "names">> & {
  names?: Partial<StoredCategoryDefaults["names"]>;
};

export interface CategorySeedPlan {
  patch: Partial<StoredCategoryDefaults>;
  created: boolean;
}

/**
 * Prepare only missing bundled category fields for Firestore. Admin-managed values always
 * win, so publishing a newer taxonomy never silently undoes an admin's edits or disables.
 */
export function planCategorySeed(
  existing: ExistingStoredCategory | undefined,
  defaults: StoredCategoryDefaults,
): CategorySeedPlan {
  if (!existing) return { patch: { ...defaults }, created: true };

  const patch: Partial<StoredCategoryDefaults> = {};
  if (existing.parentId === undefined) patch.parentId = defaults.parentId;
  if (existing.icon === undefined) patch.icon = defaults.icon;
  if (existing.sections === undefined) patch.sections = defaults.sections;
  if (typeof existing.order !== "number") patch.order = defaults.order;
  if (existing.isActive === undefined) patch.isActive = defaults.isActive;

  const existingNames = existing.names ?? {};
  const names = { ...defaults.names };
  let hasMissingName = false;
  for (const locale of Object.keys(defaults.names) as Array<keyof typeof defaults.names>) {
    const value = existingNames[locale];
    if (typeof value === "string" && value.trim().length > 0) {
      names[locale] = value;
    } else {
      hasMissingName = true;
    }
  }
  if (hasMissingName) patch.names = names;

  return { patch, created: false };
}
