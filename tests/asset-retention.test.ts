import { expect, it } from "vitest";
import { hasOtherAssetReference } from "../src/shared/asset-retention";
it("retains rejected bytes referenced by derived assets, masters or immutable provenance", () => {
  const rejected = {
    id: "candidate",
    file: "assets/candidates/a.png",
    status: "rejected",
    sourceId: "master",
  };
  expect(hasOtherAssetReference({ assets: [rejected] }, rejected.id)).toBe(
    false,
  );
  for (const dependency of [
    { id: "derived", sourceId: rejected.id },
    { id: "master-v2", sourceQualityId: rejected.id },
    { id: "attempt", provenance: { sourceId: rejected.id } },
  ])
    expect(
      hasOtherAssetReference(
        { assets: [rejected], dependencies: [dependency] },
        rejected.id,
      ),
    ).toBe(true);
  expect(
    hasOtherAssetReference(
      { assets: [rejected], other: { id: "other", sourceId: "unrelated" } },
      rejected.id,
    ),
  ).toBe(false);
});

it("never skips a project or unrelated provenance object with a colliding ID", () => {
  const rejected = {
    id: "collision",
    status: "rejected",
    file: "assets/candidates/a.png",
  };
  expect(
    hasOtherAssetReference(
      { id: "collision", assets: [rejected] },
      "collision",
    ),
  ).toBe(true);
  expect(
    hasOtherAssetReference(
      {
        assets: [rejected],
        provenance: { id: "collision", sourceId: "collision" },
      },
      "collision",
    ),
  ).toBe(true);
});
