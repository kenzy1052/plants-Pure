import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { Toaster } from "sonner";
import Navbar from "@/components/ui/Navbar";
import Footer from "@/components/ui/Footer";
import { CartHydrator } from "@/components/cart/CartHydrator";
import CartDrawer from "@/components/cart/CartDrawer";
import { ThemeHydrator } from "@/components/ui/ThemeHydrator";
import { CustomCursor } from "@/components/ui/CustomCursor";
import { publicEnv } from "@/lib/env/public";
import "./globals.css";

/**
 * Plants & Pure — Premium Botanical Atelier Typography
 *
 * Primary (display): NewYork Regular — Apple's New York serif, the same
 * editorial typeface used by the Foodo reference. Loaded locally from the
 * app/fonts/ directory (served from the same domain, no external requests).
 *
 * Secondary (body/UI): Inter — the standard for interface typography, used
 * across navigation, product descriptions, prices, forms, and all UI elements.
 * Matches the Foodo pattern where body copy uses Inter throughout.
 */

// NewYork Regular: Apple's editorial serif, served locally from the app/fonts/ dir.
// One weight (400 normal + italic via font-style) for display headings only.
// Using src as a string (single file → defaults to 400 normal style).
const newYork = localFont({
  src: "./fonts/newyork-regular.woff2",
  display: "swap",
  preload: true,
  variable: "--font-newyork",
  // fallback stack mirrors the system's serif stack for the New York font
  fallback: [
    "Georgia",
    "Cambria",
    "Times New Roman",
    "Times",
    "serif",
  ],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
  // Inter's optical sizing off; normal weights for UI legibility
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.appUrl),
  title: {
    default: "Plants & Pure | Premium Spices, Herbs & Natural Oils from Accra, Ghana",
    template: "%s | Plants & Pure",
  },
  description:
    "Plants & Pure Limited — premium aromatic spices, naturally dried herbs and quality botanical oils, thoughtfully presented from Accra, Ghana.",
  openGraph: {
    siteName: "Plants & Pure",
    locale: "en_GH",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F4EC" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1511" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newYork.variable} ${inter.variable}`}>
      <body className="flex min-h-dvh flex-col antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <ThemeHydrator />
        <CustomCursor />
        <Navbar />
        <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
          {children}
        </main>
        <Footer />
        <CartHydrator />
        <CartDrawer />
        <Toaster
          position="bottom-center"
          offset={16}
          toastOptions={{ duration: 3500 }}
          style={
            {
              "--normal-bg": "var(--p-cream)",
              "--normal-text": "var(--p-forest)",
              "--normal-border": "var(--p-warm-border)",
              "--border-radius": "8px",
              fontFamily: "var(--font-sans)",
            } as React.CSSProperties
          }
        />
      </body>
    </html>
  );
}

