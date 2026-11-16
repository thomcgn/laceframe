# Character Lock and Expression Library

## Canonical baseline

Ada Voss has a user-approved **frontal neutral master portrait** from this conversation. It is not bundled with this public repository. Load it locally in Laceframe and approve it as `ada-voss/portrait/master-v1`. Her facial features, curly dark-brown updo and loose tendrils, freckles, dark red plaid shirt, dark X-eyed smiley T-shirt, gold round pendant and brown strap identify the character.

Four user-approved emotional looks exist: **skeptical, concerned, controlled anger and amused half-smile**. They must be imported by the user; the screenshots are not in Git.

## Rules

- Master is immutable and versioned. Each candidate points to a specific version and source file hash.
- Expression edit always uses original neutral master, not another altered expression.
- An emotion family contains arbitrary variants, not a fixed-length enum; authors can add, reorder, duplicate or archive.
- Intensity is just an optional organization/UI attribute, not proof of a visual continuum.
- Emotion and vocal/action state are orthogonal: anger can be silent or shouting, and shouting can be fear or alarm.
- Outside editable face mask, preserve exact master pixels when composites are enabled. Within mask, image identity must be checked manually.
- Mouth and brow changes may require expanded jaw/head masks and careful registration. Automated pixel locks do not guarantee facial identity.
- Portrait Artistic retains native master dimensions and expressive palette; **never downscale to 64×64** by default.

## Default families

| Family | Starter variants |
| --- | --- |
| skeptical | subtle, suspicious, incredulous |
| concerned | quiet-concern, worried, distressed |
| angry | controlled, irritated, furious, shouting |
| amused | half-smile, smile, chuckle |

All entries are user-editable. Starter prompts:

- `angry.controlled`: 'Controlled, restrained anger. Lower and draw the eyebrows inward, sharpen the gaze, and gently press the lips together. No shouting, no exposed teeth, no exaggerated facial distortion.'
- `angry.shouting`: 'The SAME character shouting with controlled fury: deeply knitted brows and focused eyes, open mouth, tense jaw. Maintain all facial identity, hairstyle, clothes, palette and framing; do not redesign.'
- `skeptical.subtle`: 'Subtle skepticism. Raise one eyebrow slightly, narrow the eyes just a little, and introduce a very mild asymmetry to the closed lips. She looks unconvinced, not angry.'
- `concerned.quiet-concern`: 'Quiet concern. Draw the inner eyebrows slightly together and upward, soften the eyes, and add very subtle tension to the closed lips. No tears and no exaggerated sadness.'
- `amused.half-smile`: 'A restrained, genuine half-smile. Lift one mouth corner slightly, soften the eyelids, and add the faintest hint of warmth to the eyes. No broad grin or visible teeth.'

Prompt wrapper should declare 'Edit supplied approved master, exact same character. Only facial features allowed by mask. Keep background/transparency, camera, canvas, framing, hair, clothes and accessories unchanged.' This is guidance, NOT a guarantee. Mask compositing enforces immutability outside mask when technically feasible.

## Suggested TypeScript data

```ts
type AssetState = 'candidate' | 'approved' | 'rejected' | 'archived';
type VocalAction = 'silent' | 'speaking' | 'shouting';

type Master = {
  id: string; characterId: string; version: number;
  sha256: string; file: string; width: number; height: number;
  approvedAt: string;
};

type Family = { id: string; label: string; slug: string; order: number };
type Variant = {
  id: string; familyId: string; label: string; slug: string;
  prompt: string; intensity?: number;
  suggestedAction?: VocalAction;
  maskRegionIds: string[];
};
type ExpressionAsset = {
  id: string; masterId: string; variantId: string; action: VocalAction;
  imageFile: string; imageSha256: string; status: AssetState;
  prompt?: string; maskFile?: string; reviewedAt?: string;
};
type MotionClip = {
  id: string; characterId: string; label: string; loop: boolean;
  frames: { assetId: string; durationMs: number }[];
};
```

Use UUIDs, schema validation and stable IDs. Export a `manifest.json` including master source SHA, asset state, source dimensions, expression/action/clip IDs, frame durations and processing version. Store original image bytes separately from generated candidates and exported derivatives.

## Roadmap

- First: user imports existing expression PNGs; blink and speaking frame sequences can be assembled manually.
- Next: edit mask draw/feather, visible image difference, exact outside-mask composite.
- Later: provider-assisted variations, automated mouth/blink frame proposals, timeline onion skinning and exporting for game clients.
