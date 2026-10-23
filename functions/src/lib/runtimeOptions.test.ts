import { describe, expect, it, vi } from "vitest";

describe("runtime options", () => {
  it("never pins warm instances for hot callables — keepWarm pings them instead", async () => {
    vi.stubEnv("GCLOUD_PROJECT", "vfit-funlife");
    vi.resetModules();

    const { hotCallableOptions } = await import("./runtimeOptions");

    // minInstances must stay absent: even production must scale to zero so no
    // idle instance time is billed. See scheduled/keepWarm.ts for the warming.
    expect(hotCallableOptions()).not.toHaveProperty("minInstances");
    expect(hotCallableOptions({ cors: true })).not.toHaveProperty("minInstances");
  });

  it("still applies the shared region and keeps caller options", async () => {
    vi.resetModules();

    const { hotCallableOptions } = await import("./runtimeOptions");

    expect(hotCallableOptions({ cors: true })).toMatchObject({
      region: "europe-west1",
      cors: true,
    });
  });
});
