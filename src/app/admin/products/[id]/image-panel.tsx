"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input } from "@/components/ui/Field";
import type { AdminImage } from "@/lib/admin/catalogue";
import { thumbUrl } from "@/lib/admin/thumb";
import { adminFetch } from "../../admin-api";

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
type Signature = { uploadUrl: string; apiKey: string; signature: string; params: Record<string, string | number>; maxBytes: number };

/**
 * Product photos. Uploads go straight from the browser to Cloudinary with a short-lived
 * server signature; the server then asks Cloudinary what was really uploaded before it
 * records anything. Reordering uses buttons (keyboard and touch friendly). Removing a photo
 * deletes the record first, and the Cloudinary file only if no other product uses it.
 */
export function ImagePanel({ productId, productTitle, images, archived }: { productId: string; productTitle: string; images: AdminImage[]; archived: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ name: string; state: "uploading" | "done" | "failed"; message?: string }[]>([]);
  const [alts, setAlts] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<AdminImage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const after = (message?: string) => {
    if (message) toast.success(message);
    router.refresh();
  };
  const fail = (m: string) => {
    setError(m);
    toast.error(m);
  };

  async function upload(files: FileList | null) {
    if (!files || files.length === 0 || busy) return;
    setError(null);
    setBusy("upload");
    const list = Array.from(files);
    setStatus(list.map((f) => ({ name: f.name, state: "uploading" })));
    for (const [i, file] of list.entries()) {
      const mark = (state: "uploading" | "done" | "failed", message?: string) => setStatus((s) => s.map((x, j) => (j === i ? { ...x, state, message } : x)));
      if (!ACCEPT.includes(file.type)) { mark("failed", "Use a JPG, PNG or WebP image."); continue; }
      const sig = await adminFetch<Signature>("POST", "/api/uploads/sign", { folder: "plants-and-pure/products" });
      if (!sig.ok) { mark("failed", sig.message); if (sig.status === 401 || sig.status === 403) break; continue; }
      if (file.size > sig.data.maxBytes) { mark("failed", `Larger than ${Math.round(sig.data.maxBytes / 1024 / 1024)} MB.`); continue; }
      try {
        const fd = new FormData();
        for (const [k, val] of Object.entries(sig.data.params)) fd.append(k, String(val));
        fd.append("api_key", sig.data.apiKey);
        fd.append("signature", sig.data.signature);
        fd.append("file", file);
        const up = await fetch(sig.data.uploadUrl, { method: "POST", body: fd });
        const json = (await up.json().catch(() => null)) as { public_id?: string; error?: { message?: string } } | null;
        if (!up.ok || !json?.public_id) { mark("failed", json?.error?.message ?? "The upload was refused."); continue; }
        const done = await adminFetch("POST", "/api/uploads/confirm", { productId, publicId: json.public_id, altText: alt.trim() || undefined });
        if (done.ok) mark("done");
        else mark("failed", done.message);
      } catch {
        mark("failed", "The upload could not be completed. Check your connection.");
      }
    }
    setBusy(null);
    setAlt("");
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  async function act(key: string, run: () => Promise<{ ok: boolean; message?: string }>, success: string) {
    if (busy) return;
    setBusy(key);
    setError(null);
    const r = await run();
    setBusy(null);
    if (r.ok) after(success);
    else fail(r.message ?? "That did not work.");
  }
  const patch = (body: unknown) => adminFetch("PATCH", `/api/admin/products/${productId}/images`, body);

  const move = (i: number, dir: -1 | 1) => {
    const ids = images.map((x) => x.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    return act(`move-${images[i]!.id}`, () => patch({ action: "reorder", imageIds: ids }), "Order updated.");
  };

  async function confirmRemove() {
    const img = removing;
    if (!img) return;
    setBusy("remove");
    const r = await adminFetch<{ cloudinary: "deleted" | "kept" | "failed" }>("DELETE", `/api/admin/products/${productId}/images`, { imageId: img.id });
    setBusy(null);
    setRemoving(null);
    if (!r.ok) return fail(r.message + (r.messages.length ? ` ${r.messages.join(" ")}` : ""));
    if (r.data.cloudinary === "failed") toast.warning("Photo removed from the product, but the stored file could not be deleted. It is harmless and can be cleaned up later.");
    after("Photo removed.");
  }

  return (
    <div>
      {error && <p role="alert" className="mb-4 border-l-4 border-danger bg-danger-soft p-3 text-small text-danger">{error}</p>}
      {images.length === 0 ? (
        <p className="text-text-secondary">No photos yet. A published product needs at least one, with a cover.</p>
      ) : (
        <ol className="grid gap-4">
          {images.map((img, i) => {
            const t = thumbUrl(img.url, 160);
            const altValue = alts[img.id] ?? img.alt_text ?? "";
            const dirty = altValue !== (img.alt_text ?? "");
            return (
              <li key={img.id} className="grid gap-3 border-b border-border pb-4 sm:grid-cols-[6rem_1fr]">
                {t ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t} alt={img.alt_text ?? ""} width={96} height={96} loading="lazy" className="size-24 rounded-control object-cover" />
                ) : (
                  <span className="grid size-24 place-items-center rounded-control bg-background-alt text-caption text-text-muted">No preview</span>
                )}
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-small font-semibold">Photo {i + 1}</span>
                    {img.is_cover && <Badge tone="success">Cover</Badge>}
                    {!img.alt_text && <Badge tone="warning">No alt text</Badge>}
                  </div>
                  <div className="flex flex-wrap items-end gap-2">
                    <Field label="Alt text" hint="Describe what the photo shows, for screen readers." className="min-w-0 flex-1">
                      {(a) => <Input {...a} value={altValue} maxLength={200} disabled={archived} onChange={(e) => setAlts((s) => ({ ...s, [img.id]: e.target.value }))} />}
                    </Field>
                    <Button size="md" variant="secondary" disabled={!dirty || archived || !!busy} loading={busy === `alt-${img.id}`} onClick={() => act(`alt-${img.id}`, () => patch({ action: "alt", imageId: img.id, altText: altValue }), "Alt text saved.")}>
                      Save alt text
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" aria-label={`Move photo ${i + 1} earlier`} disabled={i === 0 || archived || !!busy} onClick={() => move(i, -1)}><ArrowUp className="size-4" aria-hidden="true" /> Earlier</Button>
                    <Button size="sm" variant="secondary" aria-label={`Move photo ${i + 1} later`} disabled={i === images.length - 1 || archived || !!busy} onClick={() => move(i, 1)}><ArrowDown className="size-4" aria-hidden="true" /> Later</Button>
                    {!img.is_cover && <Button size="sm" variant="secondary" disabled={archived || !!busy} loading={busy === `cover-${img.id}`} onClick={() => act(`cover-${img.id}`, () => patch({ action: "cover", imageId: img.id }), "Cover photo changed.")}>Make cover</Button>}
                    <Button size="sm" variant="secondary" disabled={archived || !!busy} onClick={() => setRemoving(img)}>Remove</Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {!archived && (
        <div className="mt-6 grid gap-3 border-t border-border pt-6">
          <Field id="img-alt" label="Alt text for the next upload" hint={`Optional now; add it later per photo. Example: “${productTitle} in a 100 g pack”.`}>
            {(a) => <Input {...a} value={alt} maxLength={200} onChange={(e) => setAlt(e.target.value)} disabled={!!busy} />}
          </Field>
          <div>
            <label htmlFor="img-file" className="text-small font-semibold">Add photos</label>
            <input id="img-file" ref={fileRef} type="file" accept={ACCEPT.join(",")} multiple disabled={!!busy} onChange={(e) => upload(e.target.files)} className="mt-1.5 block w-full text-small file:mr-3 file:h-11 file:cursor-pointer file:rounded-control file:border file:border-border-strong file:bg-transparent file:px-4 file:font-semibold" />
            <p className="mt-1.5 text-caption text-text-muted">JPG, PNG or WebP, up to 5 MB each. Use your own product photographs.</p>
          </div>
          {status.length > 0 && (
            <ul aria-live="polite" className="grid gap-1 text-small">
              {status.map((s, i) => (
                <li key={`${s.name}-${i}`} className={s.state === "failed" ? "text-danger" : "text-text-secondary"}>
                  {s.name}: {s.state === "uploading" ? "uploading…" : s.state === "done" ? "added" : `not added. ${s.message ?? ""}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ConfirmDialog open={!!removing} title="Remove this photo?" confirmLabel="Remove photo" danger busy={busy === "remove"} onConfirm={confirmRemove} onCancel={() => setRemoving(null)}>
        <p>
          It will no longer appear on the product page.
          {removing?.is_cover && images.length > 1 ? " Another photo becomes the cover." : ""}
          {" "}A published product must keep at least one photo; the system will stop you if this is the last one.
        </p>
      </ConfirmDialog>
    </div>
  );
}
