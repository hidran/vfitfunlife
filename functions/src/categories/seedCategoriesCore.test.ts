import { describe, expect, it } from "vitest";
import { SERVICE_CATEGORY_TREE } from "./tree";
import type { ExistingStoredCategory } from "./seedCategoriesCore";
import { planCategorySeed } from "./seedCategoriesCore";

describe("planCategorySeed", () => {
  const defaults = SERVICE_CATEGORY_TREE.photographer;

  it("seeds a complete new category", () => {
    expect(planCategorySeed(undefined, defaults)).toEqual({
      patch: defaults,
      created: true,
    });
  });

  it("fills missing localized names without overwriting edits", () => {
    const existing: ExistingStoredCategory = { names: { it: "Foto personalizzata" } };
    const plan = planCategorySeed(existing, defaults);
    expect(plan.created).toBe(false);
    expect(plan.patch.names).toMatchObject({
      it: "Foto personalizzata",
      en: defaults.names.en,
      es: defaults.names.es,
      fr: defaults.names.fr,
      de: defaults.names.de,
    });
  });

  it("fills missing fields but preserves an inactive state and customized values", () => {
    const existing: ExistingStoredCategory = {
      names: { it: "Foto personalizzata" },
      isActive: false,
      order: 777,
    };
    const plan = planCategorySeed(existing, defaults);

    expect(plan.patch).toMatchObject({
      parentId: defaults.parentId,
      icon: defaults.icon,
      sections: defaults.sections,
      names: { it: "Foto personalizzata", en: defaults.names.en },
    });
    expect(plan.patch).not.toHaveProperty("order");
    expect(plan.patch).not.toHaveProperty("isActive");
  });

  it("does not overwrite any existing admin-managed fields", () => {
    const existing = {
      parentId: "admin-parent",
      names: { it: "Foto", en: "Photo", es: "Foto", fr: "Photo", de: "Foto" },
      icon: "📷",
      sections: ["life"],
      order: 777,
      isActive: false,
    };
    expect(planCategorySeed(existing, defaults)).toEqual({ patch: {}, created: false });
  });
});
