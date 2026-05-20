import { describe, expect, it } from "vitest";

import { applyUnifiedPatch } from "../src/utils/patch.js";

describe("applyUnifiedPatch", () => {
  it("applies replacement hunks", () => {
    const input = "one\ntwo\nthree\n";
    const patch = [
      "--- a/src/lib.rs",
      "+++ b/src/lib.rs",
      "@@ -1,3 +1,3 @@",
      " one",
      "-two",
      "+deux",
      " three",
      "",
    ].join("\n");

    expect(applyUnifiedPatch(input, patch)).toBe("one\ndeux\nthree\n");
  });

  it("rejects mismatched context", () => {
    const patch = [
      "@@ -1,2 +1,2 @@",
      " missing",
      "-two",
      "+deux",
      "",
    ].join("\n");

    expect(() => applyUnifiedPatch("one\ntwo\n", patch)).toThrow(/context mismatch/);
  });
});
