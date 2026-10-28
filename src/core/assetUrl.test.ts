import { describe, expect, it } from "vitest";
import { assetUrl, assetUrls } from "./assetUrl";

describe("assetUrl", () => {
  it("prefixes BASE_URL onto absolute and relative public paths", () => {
    const base = import.meta.env.BASE_URL || "/";
    const expected = `${base.endsWith("/") ? base : `${base}/`}assets/players/x.png`;
    expect(assetUrl("/assets/players/x.png")).toBe(expected);
    expect(assetUrl("assets/players/x.png")).toBe(expected);
  });

  it("leaves remote and data URLs alone", () => {
    expect(assetUrl("https://cdn.example/p.png")).toBe("https://cdn.example/p.png");
    expect(assetUrl("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });

  it("maps lists and drops empties", () => {
    expect(assetUrls(["/images/l1.png", ""])).toHaveLength(1);
  });
});
