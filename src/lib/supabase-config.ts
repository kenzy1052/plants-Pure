/**
 * Public (browser-safe) connection details for the existing Plants & Pure Supabase project.
 * The anon key is a publishable key: Row Level Security on the database is the real gate.
 * Environment variables override these when the project is connected through Lovable settings.
 */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const SUPABASE_URL: string = env.VITE_SUPABASE_URL || "https://fjvmygnmljdbsocykseh.supabase.co";
export const SUPABASE_ANON_KEY: string =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqdm15Z25tbGpkYnNvY3lrc2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNjE3MzQsImV4cCI6MjEwNzkzNzczNH0.z26QpMXFEnyfI22cYPxHQuL4eZu46od7cirdJq8GDzs";
/** Cloudinary "cloud name" (Cloudinary dashboard → top-left / Settings → API Keys). Set VITE_CLOUDINARY_CLOUD_NAME to switch accounts without editing code. */
export const CLOUDINARY_CLOUD_NAME: string = (env.VITE_CLOUDINARY_CLOUD_NAME ?? "").trim() || "h6pcsobx";
export const PAYSTACK_PUBLIC_KEY_MODE = "test";
