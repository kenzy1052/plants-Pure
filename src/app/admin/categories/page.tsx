import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listCategories } from "@/lib/admin/catalogue";
import { CategoryManager } from "./category-manager";

export default async function AdminCategories() {
  const categories = await listCategories(await createSupabaseServerClient());
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-h2">Categories</h1>
      <p className="mt-2 text-text-secondary">
        Shoppers only see active categories. A product needs an active category to be published. Deactivating a category is blocked while live products are in it.
      </p>
      <div className="mt-8">
        <CategoryManager categories={categories} />
      </div>
    </div>
  );
}
