import { tr } from "./locales";
const unsafePath =
  /(?:file:|data:|https?:\/\/|(?:^|[\s"'])\/[^\s/]|[A-Za-z]:[\\/]|\\\\|(?:^|[\s"'])\.\.[\\/])/i;
/** Bounds before JSON.parse/Zod, including ignored/unknown input. No executable or path fields. */
export function parseBoundedJSON(json: string, limit: number): unknown {
  if (new TextEncoder().encode(json).length > limit)
    throw new Error(tr("styles.mf1d98c6e8d"));
  let depth = 0,
    quoted = false,
    escaped = false;
  for (const c of json) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "[" || c === "{") {
      if (++depth > 20) throw new Error(tr("styles.m10ccb921ec"));
    } else if (c === "]" || c === "}") depth--;
  }
  const raw: unknown = JSON.parse(json);
  let nodes = 0;
  function visit(v: unknown) {
    if (++nodes > 30000) throw new Error(tr("styles.m991879caa7"));
    if (typeof v === "string" && (unsafePath.test(v) || v.includes("\0")))
      throw new Error(tr("styles.m0359b7e148"));
    if (v && typeof v === "object")
      for (const [k, x] of Object.entries(v)) {
        if (["__proto__", "prototype", "constructor"].includes(k))
          throw new Error(tr("styles.m5a33b43a26"));
        visit(x);
      }
  }
  visit(raw);
  return raw;
}
