"use client";

import { useEffect } from "react";
import { toast } from "sonner";

const SAMPLE_LOCATIONS = [
  "East Legon",
  "Airport Residential",
  "Cantonments",
  "Osu",
  "Tema Community 6",
  "Labone",
  "Kumasi",
];

const SAMPLE_ITEMS = [
  "Wild-Harvested Prekese Powder",
  "Pure Cold-Pressed Rosemary Oil",
  "Artisanal Jollof Seasoning Blend",
  "Sun-Dried Hibiscus Flower Tea",
  "Calabash Nutmeg Infusion",
];

export default function SocialProof() {
  useEffect(() => {
    const triggerSocialProof = () => {
      const randomLoc =
        SAMPLE_LOCATIONS[Math.floor(Math.random() * SAMPLE_LOCATIONS.length)];
      const randomItem =
        SAMPLE_ITEMS[Math.floor(Math.random() * SAMPLE_ITEMS.length)];

      toast("🌿 Recent Order Placed", {
        description: `A customer in ${randomLoc} just purchased ${randomItem}.`,
        duration: 4000,
      });
    };

    // First toast after 10 seconds, then every 45-60 seconds
    const initialTimer = setTimeout(triggerSocialProof, 10000);
    const interval = setInterval(triggerSocialProof, 50000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  return null;
}
