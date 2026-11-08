/**
 * Plants & Pure Limited — business facts carried over from the existing project.
 * Sources: the company profile document (Plants_and_Pure_Company_Profile_updated.docx) and the
 * existing plantsandpure.com contact details. Nothing here is invented; details the profile leaves
 * blank (registration number, TIN, certifications) are deliberately absent.
 */
export const BUSINESS = {
  legalName: "Plants & Pure Limited",
  shortName: "Plants & Pure",
  foundedYear: 2020,
  foundedLabel: "September 2020",
  founder: "Mad. Priscilla Yeboah",
  descriptor: "Quality spices, herbs and oils — healthy living on the go!",
  tagline: "Healthy living on the go",
  story: {
    origin:
      "Plants & Pure Limited began in September 2020, born from a dream to offer wholesome, natural products that make life a bit more beautiful and healthy.",
    belief:
      "Our founder believed in the power of quality ingredients and genuine care in everything we make. That same love and dedication goes into every spice, herb and oil we produce, and it continues to guide how we grow, source, prepare, package and serve our customers.",
    mission:
      "To inspire and support women who want to create their own businesses with honesty and integrity, and to show that it is possible to succeed by keeping to high standards and delivering products that are good for the body and soul.",
    vision:
      "A world where everyone can live beautifully and healthily, surrounded by the natural goodness of quality spices, herbs and oils, with Plants & Pure as the first choice for products that bring nature's goodness into daily life.",
  },
  /** Core values — EATHI */
  values: [
    { letter: "E", name: "Excellence", body: "We set high standards in every product, process and service, and we keep improving them." },
    { letter: "A", name: "Authenticity", body: "What we say about our products and our company is genuine, and our products are what they claim to be." },
    { letter: "T", name: "Trust", body: "We earn confidence through honesty, transparency and keeping our promises." },
    { letter: "H", name: "Health & Wellness", body: "We exist to make products that support healthy, balanced living, and we put safety first." },
    { letter: "I", name: "Innovation", body: "We look for better ways to grow, process, package and present our products and to reach our customers." },
  ],
  /** Quality commitment */
  commitments: [
    "Sourcing of ingredients from reliable, traceable sources",
    "Hygienic handling, processing and packaging of all products",
    "Accurate, honest product labelling",
    "Regular inspection of products and facilities",
    "Documented procedures and records of production, stock and dispatch",
    "Prompt handling of customer feedback and complaints",
  ],
  community: {
    women:
      "We are more than a company; we are a community. Our founder's journey shows that a successful business can be built with integrity. We support and inspire women who want to start and grow their own businesses.",
    sustainability: ["Responsible sourcing of ingredients", "Eco-friendly packaging", "Efficient use of resources and careful waste handling"],
  },
  /** Display copy for the three ranges; dbSlug must match the categories table. */
  publishedCategories: [
    { name: "Spices", description: "Carefully selected spices that bring flavour, aroma and warmth to meals.", uses: "Cooking and seasoning", dbSlug: "culinary-spices" },
    { name: "Herbs", description: "Aromatic herbs prepared and packed to keep their natural character.", uses: "Cooking and infusions", dbSlug: "herbal-infusions" },
    { name: "Natural Oils", description: "Pure essential oils that are versatile for everyday use.", uses: "Culinary and skincare use", dbSlug: "pure-botanical-oils" },
  ],
  /** Retail partners (company profile, section 10 — current as at November 2026). */
  stockists: [
    { name: "Sneda Shopping Centre", where: ["Spintex Road"] },
    { name: "China Malls", where: ["Spintex", "Airport", "East Legon", "Amasaman", "Ashiaman", "Weija", "Atomic Junction"] },
    { name: "Farmers Market", where: ["Tema", "East Legon", "Labone"] },
    { name: "Farmers Haus", where: ["Kisseman", "North Legon", "Westlands", "East Legon"] },
    { name: "Farmers Touch", where: ["Ajiringano"] },
    { name: "Westlands Fresh Foods", where: ["Westlands"] },
    { name: "Ghana Mall", where: ["Osu"] },
    { name: "Natures Gift Health Shop", where: ["Adenta"] },
    { name: "Super Save Mall", where: ["East Legon", "Weija"] },
    { name: "Basik Health Shop", where: ["Oyarifa"] },
    { name: "Frimata Supermarket", where: ["Dome Pilla 2"] },
    { name: "Eddymax Supermarket", where: ["Kisseman"] },
    { name: "All Natural Products", where: ["Chardo"] },
    { name: "Beyond Meat Cold Store", where: ["Ashongman Estate"] },
    { name: "Cadcee Venture", where: ["Accra Central"] },
    { name: "E.U China Town", where: ["Afienya", "Weija"] },
    { name: "Panda Mall", where: ["Atomic Junction"] },
  ],
} as const;

export const CONTACT = {
  email: "plantsandpure@gmail.com",
  phones: [
    { label: "+233 59 608 3867", tel: "+233596083867" },
    { label: "+233 20 875 6898", tel: "+233208756898" },
    { label: "+233 54 082 8149", tel: "+233540828149" },
  ],
  hours: "Mon – Sat: 9am – 6pm",
  location: "Abladjei, Accra, Ghana",
  instagram: "https://instagram.com/plantsandpure",
  instagramHandle: "@plantsandpure",
  facebook: "https://facebook.com/plantsandpure",
  /** TikTok username supplied by the company: plants.and.pure */
  tiktok: "https://www.tiktok.com/@plants.and.pure",
  tiktokHandle: "@plants.and.pure",
  /**
   * LinkedIn: exact company-page URL still to be confirmed. This opens a LinkedIn company search for
   * "Plants & Pure" so it never 404s. Replace with https://www.linkedin.com/company/<slug> once known.
   */
  linkedin: "https://www.linkedin.com/search/results/companies/?keywords=Plants%20%26%20Pure",
} as const;

export const SITE_URL = "https://www.plantsandpure.com";
