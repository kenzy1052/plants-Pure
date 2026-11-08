/**
 * Company-supplied studio photography (no AI imagery). Used for brand storytelling only;
 * shop product cards still use the images stored with each product in the database.
 */
import logo from "@/assets/brand/logo.jpg.asset.json";
import pouchTrio from "@/assets/brand/pouch-trio.jpg.asset.json";
import pouchFlatlay from "@/assets/brand/pouch-flatlay.jpg.asset.json";
import pouchGroup from "@/assets/brand/pouch-group.jpg.asset.json";
import pouchWarm from "@/assets/brand/pouch-warm.jpg.asset.json";
import pouchRow from "@/assets/brand/pouch-row.jpg.asset.json";
import cinnamon from "@/assets/brand/bottle-cinnamon.jpg.asset.json";
import garlic from "@/assets/brand/bottle-garlic.jpg.asset.json";
import curry from "@/assets/brand/bottle-curry.jpg.asset.json";
import coconutOil from "@/assets/brand/bottle-coconut-oil.jpg.asset.json";
import coconutJar from "@/assets/brand/jar-coconut-oil.jpg.asset.json";
import ginger from "@/assets/brand/bottle-ginger.jpg.asset.json";
import whitePepper from "@/assets/brand/bottle-white-pepper.jpg.asset.json";
import blackPepper from "@/assets/brand/bottle-black-pepper.jpg.asset.json";
import allSpice from "@/assets/brand/bottle-all-spice.jpg.asset.json";
import anise from "@/assets/brand/bottle-anise.jpg.asset.json";
import rosemary from "@/assets/brand/bottle-rosemary.jpg.asset.json";
import cloves from "@/assets/brand/bottle-cloves.jpg.asset.json";
import onion from "@/assets/brand/bottle-onion.jpg.asset.json";
import sorghum from "@/assets/brand/bottle-sorghum.jpg.asset.json";

export const IMG = {
  logo: logo.url,
  pouchTrio: pouchTrio.url,
  pouchFlatlay: pouchFlatlay.url,
  pouchGroup: pouchGroup.url,
  pouchWarm: pouchWarm.url,
  pouchRow: pouchRow.url,
  coconutJar: coconutJar.url,
} as const;

export type Bottle = { name: string; src: string; size: string; q: string };
/** Bottle range as photographed. `q` is the shop search term used to link to the live product. */
export const BOTTLES: Bottle[] = [
  { name: "Cinnamon Powder", src: cinnamon.url, size: "75g", q: "cinnamon" },
  { name: "Curry Powder", src: curry.url, size: "75g", q: "curry" },
  { name: "All Spice Blend", src: allSpice.url, size: "75g", q: "spice" },
  { name: "Ginger Powder", src: ginger.url, size: "70g", q: "ginger" },
  { name: "Rosemary Powder", src: rosemary.url, size: "60g", q: "rosemary" },
  { name: "Garlic Powder", src: garlic.url, size: "70g", q: "garlic" },
  { name: "Ground Black Pepper", src: blackPepper.url, size: "70g", q: "black pepper" },
  { name: "Ground White Pepper", src: whitePepper.url, size: "70g", q: "white pepper" },
  { name: "Cloves Powder", src: cloves.url, size: "65g", q: "cloves" },
  { name: "Anise Seeds", src: anise.url, size: "65g", q: "anise" },
  { name: "Onion Powder", src: onion.url, size: "75g", q: "onion" },
  { name: "Sorghum / Waakye Leaves", src: sorghum.url, size: "60g", q: "sorghum" },
  { name: "Virgin Coconut Oil", src: coconutOil.url, size: "250ml", q: "coconut" },
];
