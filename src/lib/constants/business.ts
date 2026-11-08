/**
 * Plants & Pure Limited — business facts, with provenance.
 *
 * RULE: only facts that appear on the company's published website
 * (https://www.plantsandpure.com, checked 2026-10-20) are marked `verified`.
 * Anything else is `unverified` and must be confirmed by the business before it
 * is shown to customers as fact. Nothing here is invented to fill a gap: where
 * the business has not published something, the value is `null`.
 *
 * Delivery fees, delivery zones and the free-delivery threshold are NOT here:
 * they live in the database (public.delivery_zones) so the backend is the single
 * source of truth for prices.
 */
export type Verified<T> = { value: T; status: "verified"; source: string };
export type Unverified<T> = { value: T; status: "unverified"; note: string };

const SITE = "plantsandpure.com (home, about and contact pages)";

export const BUSINESS = {
  legalName: { value: "Plants & Pure Limited", status: "verified", source: SITE } as Verified<string>,
  shortName: "Plants & Pure",
  foundedYear: { value: 2020, status: "verified", source: "plantsandpure.com/about" } as Verified<number>,

  // The company's own words; reuse these rather than writing new marketing claims.
  descriptor: {
    value: "Dealer in natural herbal spices from natural ingredients.",
    status: "verified",
    source: "plantsandpure.com footer",
  } as Verified<string>,
  tagline: { value: "Bring Nature Into Your Home", status: "verified", source: "plantsandpure.com home" } as Verified<string>,

  contact: {
    email: { value: "plantsandpure@gmail.com", status: "verified", source: SITE } as Verified<string>,
    phones: [
      { value: "+233 59 608 3867", tel: "+233596083867", status: "verified", source: SITE },
      { value: "+233 20 875 6898", tel: "+233208756898", status: "verified", source: "plantsandpure.com/contact (not on other pages — confirm it is current)" },
    ] as const,
    hours: { value: "Mon – Sat: 9am – 6pm", status: "verified", source: "plantsandpure.com/contact" } as Verified<string>,
    location: { value: "Accra, Ghana", status: "verified", source: SITE } as Verified<string>,
    /** The business has not published a WhatsApp number. Do not link one until it confirms. */
    whatsapp: { value: null, status: "unverified", note: "Not published on the original site; confirm with the business." } as Unverified<string | null>,
    /** Street address is not published. */
    streetAddress: { value: null, status: "unverified", note: "Only 'Accra, Ghana' is published." } as Unverified<string | null>,
  },

  social: {
    instagram: { value: "https://instagram.com/plantsandpure", handle: "@plantsandpure", status: "verified", source: SITE },
    facebook: { value: "https://facebook.com/plantsandpure", status: "verified", source: SITE },
  },

  /**
   * Product categories as published on the original site (names and descriptions are the
   * company's own words). `dbSlug` links each to the matching category row in the database;
   * that mapping is UNVERIFIED (see docs/DECISIONS.md, open question 3) and only controls
   * where the home-page index links point.
   */
  publishedCategories: [
    { name: "Spices", description: "Premium, aromatic spices for cooking", dbSlug: "culinary-spices" },
    { name: "Herbs", description: "Naturally dried herbs for seasoning, garnishing and infusions", dbSlug: "herbal-infusions" },
    { name: "Natural Oils", description: "Food-grade oils for cooking, dressing and traditional wellness uses", dbSlug: "pure-botanical-oils" },
  ],

  /** The company's own published story and commitments (about page, 2026-10-20). Needs business approval before wider use. */
  story: {
    origin: "Plants & Pure began in 2020, born from a wish to offer wholesome, natural products.",
    mission: [
      "Offer natural products that make life more beautiful and healthy.",
      "Inspire and support women who want to build their own businesses with honesty and integrity.",
    ],
  },
  commitments: [
    "Ethically sourced ingredients",
    "No artificial preservatives or additives",
    "Each product checked for purity, aroma and authentic taste",
    "Fresh, careful packaging to preserve freshness",
    "Eco-friendly packaging",
    "Empowering women entrepreneurs",
  ],

  /**
   * Claims on the original site that have no published evidence. Do NOT repeat
   * them in the new storefront until the business supplies backing.
   */
  claimsNeedingEvidence: [
    "10K+ happy customers",
    "100+ products",
    "thousands of plant lovers",
    "rigorous quality testing",
    "nationwide delivery",
    "100% natural (no supporting documentation published)",
  ],

  /** Sender for transactional e-mail. Needs a verified Resend domain (account-owner task). */
  email: {
    replyTo: "plantsandpure@gmail.com",
  },
} as const;

/** Convenience accessors used by UI and e-mail templates. */
export const CONTACT = {
  email: BUSINESS.contact.email.value,
  primaryPhone: BUSINESS.contact.phones[0].value,
  primaryTel: BUSINESS.contact.phones[0].tel,
  hours: BUSINESS.contact.hours.value,
  location: BUSINESS.contact.location.value,
  instagram: BUSINESS.social.instagram.value,
  facebook: BUSINESS.social.facebook.value,
  /** null until the business publishes a WhatsApp number */
  whatsappUrl: null as string | null,
} as const;

export const COMPANY_NAME = BUSINESS.legalName.value;
