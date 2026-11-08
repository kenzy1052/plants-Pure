import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getProduct, listCategories } from "@/lib/admin/catalogue";
import { ApiError } from "@/lib/api/errors";
import { idParam, STATUS_LABEL } from "@/lib/admin/schemas";
import { Badge } from "@/components/ui/Badge";
import { ProductForm } from "../product-form";
import { ImagePanel } from "./image-panel";
import { PublicationPanel } from "./publication-panel";
import { StockPanel } from "./stock-panel";

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idParam.safeParse(id).success) notFound();
  const db = await createSupabaseServerClient();
  let detail: Awaited<ReturnType<typeof getProduct>>;
  try {
    detail = await getProduct(db, id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
  const categories = await listCategories(db);
  const { product, images, problems, movements } = detail;
  const archived = product.status === "archived";

  const section = "border-t border-border pt-8";
  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
      <div className="min-w-0">
        <p className="text-small"><Link href="/admin/products" className="underline underline-offset-4">← All products</Link></p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-h2">{product.title}</h1>
          <Badge tone={product.status === "published" ? "success" : archived ? "neutral" : "warning"}>{STATUS_LABEL[product.status]}</Badge>
        </div>
        {product.status === "published" && (
          <p className="mt-2 text-small"><Link href={`/product/${product.slug}`} className="underline underline-offset-4" target="_blank" rel="noopener">View in the shop (opens in a new tab)</Link></p>
        )}
        <div className="mt-8">
          {/* key: after a reload or a save the form restarts from the stored version */}
          <ProductForm key={product.version} mode="edit" categories={categories} product={product} />
        </div>
      </div>
      <aside className="grid grid-cols-[minmax(0,1fr)] gap-10" aria-label="Product management panels">
        <section aria-labelledby="pub-h">
          <h2 id="pub-h" className="eyebrow mb-4 text-text-muted">Publication</h2>
          <PublicationPanel productId={product.id} status={product.status} version={product.version} problems={problems} />
        </section>
        <section aria-labelledby="img-h" className={section}>
          <h2 id="img-h" className="eyebrow mb-4 text-text-muted">Photos</h2>
          <ImagePanel productId={product.id} productTitle={product.title} images={images} archived={archived} />
        </section>
        <section aria-labelledby="stock-h" className={section}>
          <h2 id="stock-h" className="eyebrow mb-4 text-text-muted">Stock</h2>
          <StockPanel productId={product.id} stock={product.stock} lowAt={product.low_stock_threshold} movements={movements} />
        </section>
      </aside>
    </div>
  );
}
