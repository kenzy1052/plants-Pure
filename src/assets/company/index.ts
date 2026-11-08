/**
 * Plants & Pure's own photography (supplied by the company). No AI-generated or stock imagery is
 * used anywhere on the site. Product shots are studio frames on black; the flat-lays are the
 * company's pouch range.
 */
import logo from "./logo.png";
import cinnamon from "./cinnamon.webp";
import garlic from "./garlic.webp";
import curry from "./curry.webp";
import ginger from "./ginger.webp";
import whitePepper from "./white-pepper.webp";
import blackPepper from "./black-pepper.webp";
import allSpice from "./all-spice.webp";
import aniseSeed from "./anise-seed.webp";
import aniseSeedTwo from "./anise-seed-2.webp";
import rosemary from "./rosemary.webp";
import cloves from "./cloves.webp";
import onion from "./onion.webp";
import sorghum from "./sorghum.webp";
import coconutOilBottle from "./coconut-oil-bottle.webp";
import coconutOilJar from "./coconut-oil-jar.webp";
import flatlayPouches from "./flatlay-pouches.webp";
import flatlayChili from "./flatlay-chili.webp";
import pouchesScoop from "./pouches-scoop.webp";
import pouchesStudio from "./pouches-studio.webp";
import pouchesRow from "./pouches-row.webp";

export const PHOTO = {
  logo,
  cinnamon,
  garlic,
  curry,
  ginger,
  whitePepper,
  blackPepper,
  allSpice,
  aniseSeed,
  aniseSeedTwo,
  rosemary,
  cloves,
  onion,
  sorghum,
  coconutOilBottle,
  coconutOilJar,
  flatlayPouches,
  flatlayChili,
  pouchesScoop,
  pouchesStudio,
  pouchesRow,
} as const;

/** Studio bottle shots, labelled exactly as printed on each pack. Used for the range rail. */
export const STUDIO_RANGE = [
  { name: "Cinnamon powder", src: cinnamon, search: "cinnamon" },
  { name: "Garlic powder", src: garlic, search: "garlic" },
  { name: "Curry powder", src: curry, search: "curry" },
  { name: "Ginger powder", src: ginger, search: "ginger" },
  { name: "Ground white pepper", src: whitePepper, search: "white pepper" },
  { name: "Ground black pepper", src: blackPepper, search: "black pepper" },
  { name: "All spice blend", src: allSpice, search: "all spice" },
  { name: "Anise seeds", src: aniseSeed, search: "anise" },
  { name: "Rosemary powder", src: rosemary, search: "rosemary" },
  { name: "Cloves powder", src: cloves, search: "cloves" },
  { name: "Onion powder", src: onion, search: "onion" },
  { name: "Sorghum (waakye leaves) powder", src: sorghum, search: "sorghum" },
  { name: "Virgin coconut oil", src: coconutOilBottle, search: "coconut" },
] as const;

/**
 * When a product has no image in the database yet, fall back to the company's own studio photo
 * for it (matched on the product title) instead of a blank placeholder.
 */
const FALLBACKS: [RegExp, string][] = [
  [/cinnamon/i, cinnamon],
  [/garlic/i, garlic],
  [/curry/i, curry],
  [/ginger/i, ginger],
  [/white\s*pepper/i, whitePepper],
  [/black\s*pepper/i, blackPepper],
  [/all\s*spice/i, allSpice],
  [/anise/i, aniseSeed],
  [/rosemary/i, rosemary],
  [/clove/i, cloves],
  [/onion/i, onion],
  [/sorghum|waakye/i, sorghum],
  [/coconut/i, coconutOilBottle],
];
export function companyPhotoFor(title: string): string | null {
  for (const [re, src] of FALLBACKS) if (re.test(title)) return src;
  return null;
}
