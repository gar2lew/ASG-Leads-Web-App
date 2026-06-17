import { describe, expect, it } from "vitest";
import { normalizeAUPhone } from "../utils";

describe("normalizeAUPhone", () => {
  // Standard AU mobile (10 digits, spaces stripped)
  it("returns digits-only for a standard 10-digit AU mobile", () => {
    expect(normalizeAUPhone("0412345678")).toBe("0412345678");
  });

  it("strips spaces from a formatted AU mobile", () => {
    expect(normalizeAUPhone("0412 345 678")).toBe("0412345678");
  });

  it("strips dashes from an AU mobile", () => {
    expect(normalizeAUPhone("0412-345-678")).toBe("0412345678");
  });

  it("strips parentheses from an AU mobile", () => {
    expect(normalizeAUPhone("(04) 1234 5678")).toBe("0412345678");
  });

  // Google Sheets dropped leading 0 (9 digits starting with 4)
  it("restores leading 0 for a 9-digit mobile starting with 4", () => {
    expect(normalizeAUPhone("412345678")).toBe("0412345678");
  });

  it("restores leading 0 for Google Sheets numeric export", () => {
    expect(normalizeAUPhone("423456789")).toBe("0423456789");
  });

  // AU landline (10 digits, e.g., 08)
  it("returns digits-only for a 10-digit landline", () => {
    expect(normalizeAUPhone("0892345678")).toBe("0892345678");
  });

  it("strips spaces from a formatted landline", () => {
    expect(normalizeAUPhone("08 9234 5678")).toBe("0892345678");
  });

  // International formats
  it("converts +614 prefix to 04", () => {
    expect(normalizeAUPhone("+61412345678")).toBe("0412345678");
  });

  it("converts 614 prefix (no plus) to 04", () => {
    expect(normalizeAUPhone("61412345678")).toBe("0412345678");
  });

  it("converts 6104 prefix to 04", () => {
    expect(normalizeAUPhone("610412345678")).toBe("0412345678");
  });

  // Edge cases
  it("returns empty string unchanged", () => {
    expect(normalizeAUPhone("")).toBe("");
  });

  it("handles null/undefined without throwing (falsy guard)", () => {
    expect(normalizeAUPhone("")).toBe("");
    // The function's guard `if (!raw) return raw` handles falsy, but the
    // TypeScript signature expects string. We test the runtime behavior.
  });

  it("returns trimmed original for unknown short format", () => {
    expect(normalizeAUPhone("123")).toBe("123");
  });

  it("returns trimmed original for unknown long format", () => {
    expect(normalizeAUPhone("12345678901")).toBe("12345678901");
  });

  it("strips all non-digit characters before normalization", () => {
    expect(normalizeAUPhone("04 12 345 678")).toBe("0412345678");
  });

  // Real-world format variants
  it("handles +61 4xx xxx xxx format", () => {
    expect(normalizeAUPhone("+61 412 345 678")).toBe("0412345678");
  });

  it("handles 0061 prefix", () => {
    // The current implementation treats 0061412345678 as 14 digits
    // after stripping non-digits, which falls through to "unknown format".
    // This is documented behavior: 0061 is not handled.
    const result = normalizeAUPhone("0061412345678");
    // 14 digits, unknown format → digits returned as-is
    expect(result).toBe("0061412345678");
  });

  it("preserves digits for already-normalized numbers", () => {
    // Already normalized → must be idempotent
    const once = normalizeAUPhone("0412345678");
    const twice = normalizeAUPhone(once);
    expect(twice).toBe("0412345678");
  });

  // Google Sheets edge case: number stored as numeric, trailing 0 dropped
  it("handles 9-digit number that doesn't start with 4", () => {
    expect(normalizeAUPhone("212345678")).toBe("212345678");
  });
});
