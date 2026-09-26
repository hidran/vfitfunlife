import { describe, expect, it, vi } from "vitest";

describe("runtime options", () => {
  it("keeps hot functions at zero warm instances outside production", async () => {
    vi.stubEnv("GCLOUD_PROJECT", "vfit-app-staging");
    vi.stubEnv("FUNCTIONS_HOT_MIN_INSTANCES", "");
    vi.resetModules();

    const { hotFunctionMinInstances } = await import("./runtimeOptions");

    expect(hotFunctionMinInstances()).toBe(0);
  });

  it("warms one hot instance in production by default", async () => {
    vi.stubEnv("GCLOUD_PROJECT", "vfit-funlife");
    vi.stubEnv("FUNCTIONS_HOT_MIN_INSTANCES", "");
    vi.resetModules();

    const { hotFunctionMinInstances } = await import("./runtimeOptions");

    expect(hotFunctionMinInstances()).toBe(1);
  });

  it("allows an explicit hot instance override for deployments", async () => {
    vi.stubEnv("GCLOUD_PROJECT", "vfit-funlife");
    vi.stubEnv("FUNCTIONS_HOT_MIN_INSTANCES", "2");
    vi.resetModules();

    const { hotFunctionMinInstances, hotCallableOptions } = await import("./runtimeOptions");

    expect(hotFunctionMinInstances()).toBe(2);
    expect(hotCallableOptions({ cors: true })).toMatchObject({
      region: "europe-west1",
      minInstances: 2,
      cors: true,
    });
  });
});
