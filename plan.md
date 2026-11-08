# Plants & Pure redesign plan

## Scope

Refresh the existing TanStack Start storefront using only supplied Plants & Pure imagery. Preserve the existing Supabase catalogue, cart, auth, checkout, payment and environment-variable integrations. Do not modify API/server behavior.

## Design

- **Design movement:** editorial luxury pantry — quiet, high-contrast layouts with restrained red accents and product photography treated like a premium still-life.
- **Core principles:** real product proof, spacious hierarchy, tactile cards, and purposeful motion.
- **Color philosophy:** warm ivory and deep charcoal create an expensive gallery backdrop; the supplied brand red becomes the signature action color; muted sage is retained only as a supporting natural cue.
- **Layout paradigm:** asymmetrical editorial compositions, oversized type, split hero, horizontal product rail, and alternating story panels rather than repeated centered grids.
- **Signature elements:** red oval brand mark, numbered section labels, fine rules, and softly rounded product frames.
- **Interaction philosophy:** small, confident transitions; product cards lift subtly; sections reveal on scroll; CTA motion is directional and restrained.
- **Animation:** existing Reveal transitions plus hover scale, image pan, and page fade; respect reduced-motion preferences.
- **Typography:** Newsreader for high-contrast editorial headlines, Inter for UI/body, Caveat only for small handwritten accents where already present.
- **Brand essence:** quality spices, herbs and oils for healthy living on the go — authentic, warm, precise. Personality: grounded, premium, caring.
- **Brand voice:** direct, sensory, trustworthy. Example lines: “Real ingredients. Remarkable everyday flavour.” / “Packed with care in Accra.”

## Implementation

- Add supplied company images under `src/assets/company`.
- Rebuild the homepage hero, range navigation, product showcase, quality proof, story, and CTA using those assets.
- Update global tokens from orange to the supplied red-led palette.
- Keep the existing `/shop`, product detail, cart, checkout, auth, account, tracking, contact and about routes functional.
- Add a static route manifest for the current page routes.


## Immersive homepage hero

- **Design movement:** cinematic botanical atelier, guided by the supplied scroll-driven reference but reinterpreted for Plants & Pure’s existing editorial brand.
- **Core principles:** product-photo fidelity, pure-black continuity, refined typography, and deliberate scroll-linked motion.
- **Color philosophy:** use #000000 across the pinned hero so the original product cutouts disappear into a seamless studio field; retain restrained warm-white text and the established brand-red accent.
- **Layout paradigm:** begin with a centered title-and-product tableau, then travel into the existing left-copy/right-product hero composition before the pin releases.
- **Signature elements:** oversized serif wordmark, staggered true product cutouts, and a fine-line scroll cue.
- **Interaction philosophy:** visitors control the sequence with reversible scroll position; no autoplay video or forced wheel capture.
- **Animation:** a sticky 100svh stage across four screen-heights, with five continuous progress chapters; CSS perspective/translate/rotate are mapped from native scroll progress. The sticky stage ends naturally; reduced-motion users see the static final hero.
- **Typography:** reuse the project’s Newsreader display and Inter body system; use the real brand identity, not a newly drawn substitute.
- **Brand essence:** authentic Ghanaian pantry products presented with premium restraint; grounded, confident, considered.
- **Implementation boundary:** replace only the active TanStack homepage Hero call and add a focused hero component/style plus extracted versions of the supplied All Spice Blend, Cinnamon Powder, and Curry Powder photographs. Keep the existing navigation, commerce routes, catalogue data, and all homepage content below the hero. Use source pixels and alpha masks only; do not reconstruct packaging or labels.

- Preserve the existing one-time brand intro on non-home routes; on `/`, mark it seen and bypass the overlay so Stage 0 is the first screen visitors encounter.
