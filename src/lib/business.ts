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
    /** One-line origin, used in short intros. */
    origin:
      "Plants & Pure Limited began in 2020, born from a dream to offer wholesome, natural products that make life a bit more beautiful and healthy.",
    /** Our Story — the three paragraphs shown on the About page. */
    paragraphs: [
      "Plants & Pure Limited began in 2020, born from a dream to offer wholesome, natural products that make life a bit more beautiful and healthy. Our founder, a passionate and driven woman, believed in the power of quality ingredients and genuine care in every product we make.",
      "What started as a small operation in a home kitchen has now grown into a thriving business that serves customers nationwide. Throughout our growth, we've maintained our commitment to quality, sustainability, and empowering other women entrepreneurs.",
      "Each spice, herb, and oil in our collection is carefully selected, ethically sourced, and packaged with love. We take pride in creating products that not only enhance your culinary adventures but also contribute to your overall wellbeing.",
    ],
    mission: [
      "Our mission is simple: to inspire and support women who want to create their own businesses with honesty and integrity. We're here to show that it's possible to succeed by sticking to high standards and delivering products that are good for the soul and the body.",
      "We believe in creating a business ecosystem that values people and planet alongside profit. Through our work, we aim to demonstrate that ethical business practices can lead to sustainable growth and meaningful impact.",
    ],
    vision: [
      "We dream of a world where everyone can live beautifully and healthily, surrounded by the natural goodness of quality spices, herbs, and oils. At Plants & Pure, we strive to be your go-to for products that bring a touch of nature's beauty into your life.",
      "Looking ahead, we envision a community of empowered women entrepreneurs, all supporting each other and creating businesses that make positive contributions to society. We aspire to be at the forefront of sustainable practices in our industry, setting new standards for quality and ethics.",
    ],
  },
  /** Our Journey: reworded milestones. The last entry is the open-ended "present" chapter. */
  journey: [
    {
      year: "2020",
      label: "2020",
      title: "A dream begins",
      body: "Plants & Pure started in a home kitchen, powered by a simple belief: honest, natural ingredients can make everyday life a little healthier and a lot more beautiful.",
    },
    {
      year: "2021",
      label: "2021",
      title: "Growing together",
      body: "Our shelf grew and so did our circle. We widened the range and began serving customers across several cities.",
    },
    {
      year: "2022",
      label: "2022",
      title: "Reaching every doorstep",
      body: "Nationwide delivery launched, carrying quality spices and herbs from our kitchen to homes across the country.",
    },
    {
      year: "2023",
      label: "2023",
      title: "Lifting other women up",
      body: "We started our women empowerment initiative, backing female entrepreneurs who are building their place in the industry.",
    },
    {
      year: "2024",
      label: "2024",
      title: "Deeper, richer, still pure",
      body: "Our collection expanded to include premium oils and wellness products, with the same quality promise on every label.",
    },
    {
      year: "2026",
      label: "2026 – Present",
      title: "The next chapter",
      body: "A fresh online home, a refined look and a fourth range, cereals, on the way. We keep growing, and we keep it pure.",
    },
  ],
  /** The four ranges shown on the home page. dbSlug must match the categories table (null = not yet in the shop). */
  ranges: [
    { key: "spices", name: "Spices", description: "Warm, aromatic and carefully selected for everyday cooking.", dbSlug: "culinary-spices", status: "live" },
    { key: "herbs", name: "Herbs", description: "Sun-kissed herbs packed to keep their natural character.", dbSlug: "herbal-infusions", status: "live" },
    { key: "oils", name: "Natural Oils", description: "Pure, versatile oils for the kitchen and for skin care.", dbSlug: "pure-botanical-oils", status: "live" },
    { key: "cereals", name: "Cereals", description: "Wholesome, nourishing grains for a good start to the day.", dbSlug: null, status: "soon" },
  ],
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
