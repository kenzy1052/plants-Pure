/**
 * Thumbnail for a stored Cloudinary delivery URL (admin lists/panels). Only rewrites URLs on
 * res.cloudinary.com; anything else is returned as null so a bad value is never rendered.
 */
export function thumbUrl(url: string | null | undefined, size = 96): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.hostname !== "res.cloudinary.com" || !u.pathname.includes("/image/upload/")) return null;
    u.pathname = u.pathname.replace("/image/upload/", `/image/upload/f_auto,q_auto,c_fill,w_${size},h_${size}/`);
    return u.toString();
  } catch {
    return null;
  }
}
