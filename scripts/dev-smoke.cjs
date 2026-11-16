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
    // Assert the first navigation before any reload: reloads can hide startup failures.
    await expect(
      page.getByRole("heading", { name: "Characters", exact: true }),
    ).toBeVisible({ timeout: 10000 });
    const result = await page.evaluate(() =>
      window.laceframe.preview("00000000-0000-4000-8000-000000000000"),
    );
    expect(result).toEqual({
      ok: false,
      error: "Bitte zuerst ein Projekt öffnen.",
    });
    // Exercise renderer-initiated navigation: CDP page.reload() bypasses
    // Electron's will-navigate handler and would miss this regression.
    await Promise.all([
      page.waitForEvent(
        "framenavigated",
        (frame) => frame === page.mainFrame(),
      ),
      page.evaluate(() => window.location.assign(window.location.href)),
    ]);
    await expect(
      page.getByRole("heading", { name: "Characters", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() =>
        window.laceframe.preview("00000000-0000-4000-8000-000000000000"),
      ),
    ).toEqual(result);
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
