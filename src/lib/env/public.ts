/**
 * Public (browser-safe) configuration.
 *
 * Only NEXT_PUBLIC_* variables may be read here. Each is referenced STATICALLY
 * (process.env.NEXT_PUBLIC_X, never process.env[name]) because Next.js inlines
 * them into the browser bundle at build time and cannot do so for dynamic
 * lookups. Nothing secret may ever be added to this file.
 */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  cloudinaryCloudName: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME || "",
} as const;

export function hasSupabasePublicConfig(): boolean {
  return Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
}
