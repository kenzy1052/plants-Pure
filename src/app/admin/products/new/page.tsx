import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listCategories } from "@/lib/admin/catalogue";
import { ProductForm } from "../product-form";

export default async function NewProduct() {
  const categories = await listCategories(await createSupabaseServerClient());
  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-small"><Link href="/admin/products" className="underline underline-offset-4">← All products</Link></p>
      <h1 className="mt-4 text-h2">New product</h1>
      <p className="mt-2 text-text-secondary">It is saved as a draft and stays hidden from the shop until you publish it.</p>
      {categories.length === 0 && (
        <p role="status" className="mt-6 border-l-4 border-border-strong bg-background-alt p-4 text-small">
          There are no categories yet. You can save a draft without one, but a category is required to publish.{" "}
          <Link href="/admin/categories" className="underline underline-offset-4">Create categories</Link>
        </p>
      )}
      <div className="mt-8">
        <ProductForm mode="create" categories={categories} />
      </div>
    </div>
  );
}
