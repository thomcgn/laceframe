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
    await page.reload();
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
