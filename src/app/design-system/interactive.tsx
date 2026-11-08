"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { QuantityStepper } from "@/components/ui/QuantityStepper";

export function StyleguideInteractive() {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(2);
  return (
    <div className="flex flex-wrap items-center gap-6">
      <Button variant="secondary" onClick={() => setOpen(true)}>Open sample drawer</Button>
      <QuantityStepper value={qty} onChange={setQty} max={10} label="Sample quantity" />
      <Drawer open={open} onClose={() => setOpen(false)} title="Sample drawer">
        <div className="p-6">
          <p className="text-text-secondary">Native dialog: focus is trapped, Escape closes it, and focus returns to the button.</p>
          <Button className="mt-6" onClick={() => setOpen(false)}>Close</Button>
        </div>
      </Drawer>
    </div>
  );
}
