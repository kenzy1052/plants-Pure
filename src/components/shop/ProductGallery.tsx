import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, Expand, X } from "lucide-react";
import { ProductImage } from "@/components/shop/ProductCard";
import { cn } from "@/lib/utils";

type Img = { url: string; alt?: string | null };

/**
 * Product photos that always fit on screen. Tap the photo to open a full-screen gallery you can
 * swipe (or use the arrow keys) to see the rest.
 */
export function ProductGallery({ images, title, hero = false }: { images: Img[]; title: string; hero?: boolean }) {
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const current = images[active];

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Open ${title} photos in full screen`}
        className={cn(
          "group relative flex items-center justify-center overflow-hidden bg-container",
          // hero: a full-width photo on phones/tablets (the details card slides over it); a framed square from lg up
          hero
            ? "h-[52svh] max-h-[30rem] min-h-[18rem] w-full lg:mx-auto lg:aspect-square lg:h-auto lg:max-h-none lg:min-h-0 lg:w-[min(100%,68vh)] lg:rounded-[1.5rem]"
            : "mx-auto aspect-square w-[min(100%,68vh)] rounded-[1.5rem]",
        )}
      >
        <ProductImage key={current?.url ?? "none"} src={current?.url} alt={current?.alt || title} w={1000} fit priority className="animate-in fade-in object-contain duration-500" />
        <span className={cn("absolute right-3 inline-flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1.5 text-xs font-semibold shadow-soft backdrop-blur transition-transform group-hover:scale-105", hero ? "bottom-12 lg:bottom-3" : "bottom-3")}>
          <Expand className="h-3.5 w-3.5" /> {images.length > 1 ? `${active + 1} / ${images.length}` : "View"}
        </span>
      </button>

      {hero && images.length > 1 && (
        <div className="absolute inset-x-0 bottom-12 flex justify-center gap-1.5 lg:hidden" role="group" aria-label="Choose photo">
          {images.map((img, i) => (
            <button key={img.url} type="button" aria-label={`Show photo ${i + 1}`} aria-pressed={i === active} onClick={() => setActive(i)} className="flex h-6 items-center">
              <span className={cn("h-1.5 rounded-full bg-foreground/80 transition-all", i === active ? "w-5" : "w-1.5 opacity-40")} />
            </button>
          ))}
        </div>
      )}

      {images.length > 1 && (
        <div className={cn("mx-auto mt-3 w-[min(100%,68vh)] gap-2 overflow-x-auto pb-1", hero ? "hidden lg:flex" : "flex")}>
          {images.map((img, i) => (
            <button key={img.url} type="button" onClick={() => setActive(i)} aria-label={`Show photo ${i + 1}`} aria-pressed={i === active} className={cn("h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-container ring-offset-2 ring-offset-background transition sm:h-20 sm:w-20", i === active ? "ring-2 ring-pepper" : "opacity-70 hover:opacity-100")}>
              <ProductImage src={img.url} alt="" w={200} square />
            </button>
          ))}
        </div>
      )}

      <Lightbox open={open} onOpenChange={setOpen} images={images} title={title} start={active} onIndex={setActive} />
    </div>
  );
}

function Lightbox({ open, onOpenChange, images, title, start, onIndex }: { open: boolean; onOpenChange: (o: boolean) => void; images: Img[]; title: string; start: number; onIndex: (i: number) => void }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[100] bg-black/90 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-0 z-[101] flex flex-col outline-none" aria-describedby={undefined}>
          <DialogPrimitive.Title className="sr-only">{title} photos</DialogPrimitive.Title>
          {open && <Slides images={images} title={title} start={start} onIndex={onIndex} />}
          <DialogPrimitive.Close aria-label="Close gallery" className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition-colors hover:bg-white/25">
            <X className="h-5 w-5" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Slides({ images, title, start, onIndex }: { images: Img[]; title: string; start: number; onIndex: (i: number) => void }) {
  const [ref, api] = useEmblaCarousel({ startIndex: start, loop: images.length > 2 });
  const [idx, setIdx] = useState(start);
  const sync = useCallback(() => {
    if (!api) return;
    const i = api.selectedScrollSnap();
    setIdx(i);
    onIndex(i);
  }, [api, onIndex]);
  useEffect(() => {
    if (!api) return;
    api.on("select", sync);
    return () => {
      api.off("select", sync);
    };
  }, [api, sync]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") api?.scrollPrev();
      if (e.key === "ArrowRight") api?.scrollNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [api]);

  return (
    <>
      <div className="relative flex min-h-0 flex-1 items-center">
        <div ref={ref} className="h-full w-full overflow-hidden">
          <div className="flex h-full">
            {images.map((img, i) => (
              <div key={img.url} className="flex h-full min-w-0 shrink-0 grow-0 basis-full items-center justify-center p-4 sm:p-10">
                <ProductImage src={img.url} alt={img.alt || `${title} — photo ${i + 1}`} w={1600} fit className="h-auto max-h-full w-auto max-w-full rounded-xl bg-transparent object-contain" priority={i === start} />
              </div>
            ))}
          </div>
        </div>
        {images.length > 1 && (
          <>
            <button type="button" aria-label="Previous photo" onClick={() => api?.scrollPrev()} className="absolute left-3 hidden h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25 sm:inline-flex"><ChevronLeft className="h-6 w-6" /></button>
            <button type="button" aria-label="Next photo" onClick={() => api?.scrollNext()} className="absolute right-3 hidden h-12 w-12 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur hover:bg-white/25 sm:inline-flex"><ChevronRight className="h-6 w-6" /></button>
          </>
        )}
      </div>
      <div className="flex items-center justify-center gap-2 pb-6 pt-2" aria-live="polite">
        {images.length > 1 ? images.map((_, i) => (
          <button key={i} type="button" aria-label={`Go to photo ${i + 1}`} onClick={() => api?.scrollTo(i)} className={cn("h-2 rounded-full transition-all", i === idx ? "w-6 bg-white" : "w-2 bg-white/40")} />
        )) : <span className="text-xs text-white/60">{title}</span>}
      </div>
    </>
  );
}
