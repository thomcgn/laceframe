/** Vite can reload its entry page while preparing dependencies on first launch. */
export function mayNavigateDevelopmentPage(
  target: string,
  developmentURL?: string,
): boolean {
  if (!developmentURL) return false;
  try {
    const expected = new URL(developmentURL);
    return (
      expected.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(expected.hostname) &&
      target === expected.href
    );
  } catch {
    return false;
  }
}
