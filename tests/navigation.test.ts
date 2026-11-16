import { describe, expect, it } from "vitest";
import { mayNavigateDevelopmentPage } from "../src/main/navigation";

describe("development navigation boundary", () => {
  it.each([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://[::1]:5173",
  ])("permits Vite to reload its exact entry URL at %s", (developmentURL) => {
    expect(
      mayNavigateDevelopmentPage(`${developmentURL}/`, developmentURL),
    ).toBe(true);
  });
  it.each([
    "https://example.com/",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:text/html,hello",
    "http://localhost:5174/",
    "http://localhost:5173/other",
    "http://localhost:5173/?changed=1",
    "http://localhost:5173/#changed",
    "http://localhost.evil.test:5173/",
    "http://localhost:5173@evil.test/",
  ])("rejects a renderer navigation to %s", (target) => {
    expect(mayNavigateDevelopmentPage(target, "http://localhost:5173")).toBe(
      false,
    );
  });
  it("denies every packaged-app navigation and malformed/nonlocal dev URLs", () => {
    expect(mayNavigateDevelopmentPage("laceframe://app/index.html")).toBe(
      false,
    );
    expect(mayNavigateDevelopmentPage("http://localhost:5173/")).toBe(false);
    expect(mayNavigateDevelopmentPage("x", "invalid")).toBe(false);
    expect(
      mayNavigateDevelopmentPage(
        "https://example.com/",
        "https://example.com/",
      ),
    ).toBe(false);
    expect(
      mayNavigateDevelopmentPage("file:///etc/passwd", "file:///etc/passwd"),
    ).toBe(false);
  });
});
