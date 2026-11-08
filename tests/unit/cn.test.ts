import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils";

describe("cn (class merging)", () => {
  it("keeps a text colour next to a custom type-scale size", () => {
    expect(cn("bg-action text-text-inverse", "h-11 px-5 text-small")).toContain("text-text-inverse");
    expect(cn("text-text-inverse", "text-body")).toBe("text-text-inverse text-body");
  });
  it("still lets a later colour replace an earlier colour, and a later size replace a size", () => {
    expect(cn("text-text", "text-danger")).toBe("text-danger");
    expect(cn("text-small", "text-body")).toBe("text-body");
  });
});
