/** Conservative reference check on bounded, schema-validated project data. */
export function hasOtherAssetReference(project: unknown, id: string): boolean {
  function visit(value: unknown): boolean {
    if (value === id) return true;
    if (!value || typeof value !== "object") return false;
    if (
      !Array.isArray(value) &&
      "id" in value &&
      value.id === id &&
      "status" in value &&
      value.status === "rejected" &&
      "file" in value &&
      typeof value.file === "string"
    )
      return false;
    return Object.values(value).some(visit);
  }
  return visit(project);
}
