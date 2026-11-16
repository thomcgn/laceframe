# Laceframe — Art Direction, Identity, Outfit and Expression Profiles

Status: approved product architecture / implementation specification. Do not confuse with functionality already shipped.

## Core principle

**Same game style ≠ same character ≠ same clothing ≠ same emotional performance.**

Ada Voss and a distinct character such as Peter Bishop should visibly belong to the same game's art direction without sharing Ada's grunge clothing, curls, facial structure or emotional mannerisms. A new game can use an entirely different art direction. Changes to a character's expression must not leak to other characters.

## Independent axes

1. **ArtDirectionProfile (project-level, versioned)**: rendering technique, contour weight, pixel-cluster and detail characteristics, lighting principles, palette behavior (NOT same colors for every person), portrait framing conventions and style reference asset hashes. A style can be reused across distinct characters, but must not copy their identity.
2. **CharacterIdentityProfile (per character, versioned)**: appearance identity/face/hair/proportions, identity source photo or illustration (optional), approved master version and unique fixed traits. Never copy Ada's identity into someone else's master.
3. **OutfitProfile (per character, optional and extensible)**: clothing and accessories for period/scene; distinct from identity; initial Ada outfit remains unchanged, no automatic wardrobe transfers.
4. **ExpressionPerformanceProfile (per character)**: personal rules for expressing emotion, e.g. Ada's anger is direct and tightly controlled and can escalate explosively; another person may show anger via jaw tension and downward gaze. Each character may override one shared family/variant with a personal prompt. Character-specific overrides are not global template edits.
5. **Expression state / intensity / vocal action / gesture** are separate at runtime. Angry + shouting does not imply that every angry portrait is shouting; gesture 'hands in hair' is separate from sorrow and deferred until pose editing/motion.

## Rules for image-generation prompt composition

Compose with clearly separated, labeled sections:
- STYLE LOCK: project art direction and its **style-only reference**.
- CHARACTER LOCK: selected character and its immutable master as **identity reference**.
- OUTFIT LOCK: character's selected clothing profile (only if configured).
- EXPRESSION: shared emotion name and selected family/variant.
- PERFORMANCE: character-specific expression instructions, else shared fallback.
- ACTION: silent / speaking / shouting independent of expression.
- USER NOTES: additional instruction with clear precedence policy.

A style image is **not** a substitute identity image. If the provider cannot accept both references, show capability limitation and do not silently omit the identity reference. Style-only transfer is a guideline; identity preservation needs review. Never claim 'pixel-perfect' unless actually verified.

For current approved Ada Voss master and four existing emotion images, no migration may alter files, prompts, IDs or approval states retroactively. Prompts associated with existing attempts must remain immutable snapshots. A new profile revision affects only future attempts.

## Minimal migration design

Implement new optional/additive objects (either linked records or separate versioned project metadata) with explicit schema migrations from existing format, backups on first write, and no destructive remapping:

```ts
interface ArtDirectionProfile {
  id: string;
  name: string;
  revision: number;
  description: string;
  renderRules: string; // visual treatment only; avoid wardrobe/character identity
  lightingRules?: string;
  colorRules?: string;
  framingRules?: string;
  styleReferenceAssetIds: string[];
}

interface ExpressionPerformanceOverride {
  characterId: string;
  variantId: string;
  direction: string;
  // May optionally clarify personal gestural escalation, but
  // does not force a gesture in the first implementation.
}

interface CharacterArtSettings {
  characterId: string;
  artDirectionProfileId?: string; // defaults to project choice
  identityNotes?: string;
  activeOutfitId?: string; // future data model; no costume generator in this milestone
}
```

IDs should be UUIDs, object validation strict; stable refs, max sizes, safe project-local paths; no internet-dependent requirements. Keep optional fields absent for old projects; migration must preserve original asset bytes, their SHA-256 and original prompt revisions.

## Initial UX

- **Art Direction** section in Settings or Characters; project-wide selected profile, derived manually from Ada's rendering style but stripped of her personal traits. User can edit style rules and choose locally imported style reference(s).
- **Character → Expression Identity**: personal performance instructions per expression variant, optional override. If unset, the common variant description is used. A per-character preview explains effective prompt.
- **Create**: show current Style / Character / Outfit / Expression chips and a 'View resolved prompt' inspector, with simple edit affordances.
- Keep character-specific data outside shared Families/Variants. Editing a variant template should not overwrite personal overrides.
- Full photo→new character master wizard deferred; data model must make it possible later.
- No new gesture generation, mask editor, or transition animation in this slice.

## Acceptance tests

1. Import/retain existing Ada Voss project: identical original/master/candidate SHA-256, approved states and past prompt revisions after migration and restart.
2. Add a second figure, set same project art direction as Ada; profile text contains only shared rendering principles, not her clothing/face.
3. Both figures can have `angry / controlled`, but personal performance directions differ and prompt composer reflects selected character.
4. Update Peter's anger notes; Ada's settings and prompt remain unchanged.
5. No override: shared variant prompt continues to work.
6. Create a custom art direction profile for another project; must not affect Ada game's profile.
7. Resolve both profile references in prompt and candidate provenance; handle missing/deleted references honestly.
8. Tests for schema migrations, uniqueness, cross-character data isolation, prompt composition and persistence/reopen.

## Example (illustrative only)

Project style: 'Ada Voss Illustrated Noir' — consistent illustrative pixel structure, dark crisp outlines, layered shading, warm/cool contrast and deliberate high-detail portrait finish.

Ada anger: brows drawn inward, direct unwavering gaze, lips pressed; shouting is a separate escalating pose.

Peter anger: jaw tension, reduced eye contact, tightly contained frustration (example only; must be confirmed by creator). His face, clothing, skin and hair come from his own identity master.

**No universal 'angry face' template can override character-specific performance rules.**
