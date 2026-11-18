const { chromium, expect } = require("@playwright/test");

// First run: npm run start -- -- --remote-debugging-port=9232
(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9232");
  try {
    const page = browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((p) => p.url().startsWith("http://localhost:"));
    if (!page)
      throw new Error(
        "Start the Laceframe development app on debugging port 9232 first.",
      );
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Verify first-load rendering before any reload: catches blocked Vite navigation.
    await expect(
      page.getByRole("button", { name: "Neues Projekt", exact: true }),
    ).toBeVisible({ timeout: 25000 });
    await expect(page.locator(".sidebar")).toHaveCount(0);
    expect(
      await page
        .locator(".splash-image")
        .evaluate((image) => ({
          loaded: image.complete,
          width: image.naturalWidth,
          height: image.naturalHeight,
        })),
    ).toEqual({ loaded: true, width: 1827, height: 861 });
    const result = await page.evaluate(() =>
      window.laceframe.preview("00000000-0000-4000-8000-000000000000"),
    );
    expect(result).toEqual({
      ok: false,
      error: "Bitte zuerst ein Projekt öffnen.",
    });
    const url = page.url();
    await Promise.all([
      page.waitForEvent(
        "framenavigated",
        (frame) => frame === page.mainFrame(),
      ),
      page.evaluate(() => window.location.assign(window.location.href)),
    ]);
    await expect(
      page.getByRole("button", { name: "Neues Projekt", exact: true }),
    ).toBeVisible({ timeout: 25000 });
    expect(page.url()).toBe(url);
    expect(errors).toEqual([]);
    console.log(
      "PASS npm run start: React UI visible, preload available, dev sender accepted, no renderer exceptions.",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
