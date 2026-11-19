import { queryOptions } from "@tanstack/react-query";
import { getAnonSupabase } from "./supabase";

/** Testimonials stay completely hidden until this many reviews have been approved in the admin. */
export const MIN_TESTIMONIALS_TO_SHOW = 5;

export type Testimonial = { id: string; name: string; rating: number; title: string | null; body: string; created_at: string };
export type TestimonialsPayload = { count: number; average: number | null; items: Testimonial[] };

export const testimonialsQuery = () =>
  queryOptions({
    queryKey: ["testimonials"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TestimonialsPayload> => {
      const { data, error } = await getAnonSupabase().rpc("public_testimonials", { p_limit: 24 });
      if (error) throw error;
      const d = data as TestimonialsPayload;
      return { count: Number(d.count ?? 0), average: d.average == null ? null : Number(d.average), items: d.items ?? [] };
    },
  });

export const testimonialsVisible = (d: TestimonialsPayload | undefined): d is TestimonialsPayload =>
  Boolean(d && d.count >= MIN_TESTIMONIALS_TO_SHOW && d.items.length >= MIN_TESTIMONIALS_TO_SHOW);
