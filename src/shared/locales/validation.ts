/** Pure catalogue validation, also usable for a future explicitly imported language pack. */
export function validateCatalogue(
  reference: unknown,
  candidate: unknown,
): string[] {
  const valid = (value: unknown): value is Record<string, string> =>
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((v) => typeof v === "string" && !!v.trim());
  if (!valid(reference) || !valid(candidate))
    return ["Invalid catalogue structure"];
  const problems: string[] = [];
  const placeholders = (text: string) =>
    [...text.matchAll(/\{\{(\w+)\}\}/g)]
      .map((m) => m[1])
      .sort()
      .join(",");
  for (const [key, value] of Object.entries(reference)) {
    if (!(key in candidate)) problems.push(`Missing key: ${key}`);
    else if (placeholders(value) !== placeholders(candidate[key]))
      problems.push(`Placeholder mismatch: ${key}`);
  }
  for (const key of Object.keys(candidate))
    if (!(key in reference)) problems.push(`Obsolete key: ${key}`);
  return problems;
}
