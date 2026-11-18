import { studioSteps } from "../src/renderer/components/StudioSteps";
import { setLanguage, uiLabel } from "../src/shared/locales";
import { describe, expect, it } from "vitest";
import {
  updateStudioPrompt,
  promptRequirements,
  libraryAssets,
  libraryMasterId,
} from "../src/shared/studio";
import {
  newComposer,
  editComposer,
  keepComposer,
  resetComposer,
} from "../src/shared/generation";
import type { Project } from "../src/shared/domain";
describe("Studio automatic/supplement/expert revision behavior", () => {
  it.each(["automatic", "supplement"] as const)(
    "%s follows a new style revision even after saving; history is untouched",
    (mode) => {
      const historical = Object.freeze({
        ...newComposer("R1 exact immutable prompt"),
        saved: true,
      });
      const working = updateStudioPrompt(
        historical,
        "R2 current style and references",
        mode,
      );
      expect(working.text).toBe("R2 current style and references");
      expect(working.pendingBase).toBeUndefined();
      expect(historical.text).toBe("R1 exact immutable prompt");
      expect(promptRequirements(mode, working, working.base)).toEqual([]);
    },
  );
  it("expert preserves edited text and blocks after a new master/style selection until explicitly resolved", () => {
    const edited = editComposer(
      newComposer("Master V1 / R1"),
      "Manual expert text",
    );
    const changed = updateStudioPrompt(edited, "Master V2 / R2", "expert");
    expect(changed.text).toBe("Manual expert text");
    expect(
      promptRequirements("expert", changed, "Master V2 / R2")[0].message,
    ).toContain("ausdrücklich");
    expect(keepComposer(changed)).toMatchObject({
      base: "Master V2 / R2",
      text: "Manual expert text",
      edited: true,
    });
    expect(resetComposer(changed).text).toBe("Master V2 / R2");
  });
  it("automatic mode cannot silently submit expert text as an automatic prompt", () => {
    const expert = editComposer(newComposer("A"), "Override");
    expect(updateStudioPrompt(expert, "A", "automatic").text).toBe("A");
    expect(promptRequirements("automatic", newComposer("A"), "B")).toHaveLength(
      1,
    );
  });
  it("empty prompts report a prerequisite instead of fabricated readiness", () =>
    expect(
      promptRequirements("automatic", newComposer(""), "")[0].message,
    ).toContain("vollständigen"));
  it("returning to unchanged settings keeps the saved working state", () => {
    const state = { ...newComposer("unchanged"), saved: true };
    expect(updateStudioPrompt(state, "unchanged", "automatic")).toEqual(state);
  });
});
describe("Library IDs and historical character/master separation", () => {
  const p = {
    masters: [
      { id: "m1", characterId: "one", version: 1 },
      { id: "m2", characterId: "one", version: 2 },
      { id: "foreign", characterId: "two", version: 1 },
    ],
    masterCandidates: [
      {
        id: "candidate",
        characterId: "one",
        status: "rejected",
        attemptId: "creator",
      },
    ],
    assets: [
      {
        id: "expr",
        characterId: "one",
        masterId: "m1",
        status: "approved",
        variantId: "v",
      },
      {
        id: "other",
        characterId: "two",
        masterId: "foreign",
        status: "candidate",
        variantId: "v",
      },
    ],
    qualityAssets: [
      {
        id: "q",
        characterId: "one",
        sourceId: "m1",
        operation: "cutout",
        status: "candidate",
      },
    ],
    variants: [{ id: "v", label: "Angry" }],
  } as unknown as Project;
  it("lists all four asset categories by their actual IDs without rebinding an old expression", () => {
    const before = JSON.stringify(p);
    const entries = libraryAssets(p, "one");
    expect(entries.map((a) => a.id)).toEqual([
      "m1",
      "m2",
      "candidate",
      "expr",
      "q",
    ]);
    expect(entries.find((a) => a.id === "expr")).toMatchObject({
      masterId: "m1",
      state: "approved",
      kind: "expression",
    });
    expect(JSON.stringify(p)).toBe(before);
  });
  it("keeps another character's source isolated", () =>
    expect(libraryAssets(p, "two").map((a) => a.id)).toEqual([
      "foreign",
      "other",
    ]));
  it("resolves quality descendants to their original master instead of today's master", () => {
    expect(libraryMasterId(p, "q")).toBe("m1");
    expect(libraryMasterId(p, "expr")).toBe("m1");
    expect(libraryMasterId(p, "m2")).toBe("m2");
    expect(libraryMasterId(p, "candidate")).toBeUndefined();
    const cyclic = {
      ...p,
      qualityAssets: [{ id: "cycle", sourceId: "cycle" }],
    } as unknown as Project;
    expect(libraryMasterId(cyclic, "cycle")).toBeUndefined();
  });
  it("returns an empty library for an unknown character", () =>
    expect(libraryAssets(p, "missing")).toEqual([]));
});

it("keeps internal Studio steps stable while translating presentation", async () => {
  try {
    await setLanguage("en");
    expect(studioSteps).toEqual([
      "Auswählen",
      "Erzeugen",
      "Bearbeiten",
      "Freigeben",
    ]);
    expect(studioSteps.map(uiLabel)).toEqual([
      "Select",
      "Generate",
      "Edit",
      "Approve",
    ]);
    await setLanguage("de");
    expect(studioSteps.map(uiLabel)).toEqual([
      "Auswählen",
      "Erzeugen",
      "Bearbeiten",
      "Freigeben",
    ]);
  } finally {
    await setLanguage("de");
  }
});
