import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { confirmOrderReceived } from "@/lib/checkout.functions";

/**
 * "I've received my order" — shown to the customer once an order is on its way (or ready to collect).
 * Moves the order to Delivered/Collected so staff and the customer see the same status.
 */
export function ReceivedButton({ code, pickup, onDone, className }: { code: string; pickup: boolean; onDone?: () => void; className?: string }) {
  const confirm = useServerFn(confirmOrderReceived);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="pepper"
      size="sm"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await confirm({ data: { code } });
          if (res.ok) {
            toast.success(pickup ? "Thanks — marked as collected." : "Thanks — marked as received.");
            onDone?.();
          } else {
            toast.error(res.error);
          }
        } catch {
          toast.error("We couldn't update your order. Please check your connection and try again.");
        }
        setBusy(false);
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
      {pickup ? "I've collected my order" : "I've received my order"}
    </Button>
  );
}
