import { describe, it, expect } from "vitest";
import { downloadUrl, sanitizeRef, SITE_URL } from "../constants";

// Download links carry only where they came from — a ref token and, when
// relevant, the realm slug — because that is literally all the /download
// route stores.
describe("downloadUrl", () => {
  it("builds a plain ref link", () => {
    expect(downloadUrl("hero")).toBe("/download?ref=hero");
  });

  it("attaches the realm when one is given", () => {
    expect(downloadUrl("realm-cta", "atm10-ab12cd")).toBe("/download?ref=realm-cta&realm=atm10-ab12cd");
  });

  it("strips anything that is not a token from both fields", () => {
    expect(sanitizeRef("  status page; drop table; <script>  ")).toBe("statuspagedroptablescript");
    expect(sanitizeRef("")).toBe("unknown");
    // Dots survive (harmless in a query value); separators and operators don't.
    expect(downloadUrl("../../etc", "a b&c=d")).toBe("/download?ref=....etc&realm=abcd");
    const long = "x".repeat(200);
    expect(sanitizeRef(long)).toHaveLength(80);
  });
});

describe("SITE_URL", () => {
  it("defaults to the production site", () => {
    // NEXT_PUBLIC_SITE_URL is a build-time inlining; the default must be the
    // real domain so sitemap/OG absolute URLs are right in production builds.
    expect(SITE_URL).toMatch(/^https?:\/\//);
    expect(SITE_URL).not.toContain("localhost");
  });
});
