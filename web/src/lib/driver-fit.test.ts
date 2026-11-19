import { describe, expect, it } from "vitest";
import { driverFit } from "./driver-fit";

const dim = (key: string, value: number, confidence = 0.8) => ({ key, value, confidence });

describe("driverFit (rule of thumb)", () => {
  it("says nothing without anything to go on", () => {
    expect(driverFit([], null)).toBeNull();
  });

  it("points hip-hop at a dynamic driver, and says why", () => {
    const fit = driverFit(["hip_hop"], "hip_hop");
    expect(fit?.category).toBe("dynamic");
    expect(fit?.because[0]).toMatch(/sub-bass/);
  });

  it("points stage monitoring at balanced armatures", () => {
    expect(driverFit(["stage_monitoring"], null)?.category).toBe("balanced_armature");
  });

  it("weighs the most important card double", () => {
    const fit = driverFit(["rock_metal", "competitive_gaming"], "rock_metal");
    expect(fit?.category).toBe("planar");
  });

  it("lets the listener's own sound lean it, only where measured with confidence", () => {
    const bassy = [dim("sub_bass", 0.9), dim("mid_bass", 0.85)];
    expect(driverFit(["pop"], null, bassy)?.category).toBe("dynamic");
    const unsure = [dim("sub_bass", 0.9, 0.1), dim("mid_bass", 0.85, 0.1)];
    expect(driverFit(["pop"], null, unsure)?.category).toBe("hybrid");
  });
});
