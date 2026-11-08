import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/btn relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-sans font-medium transition-[background-color,color,border-color,transform,box-shadow] duration-300 ease-[var(--ease-settle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-brand-gradient text-primary-foreground hover:brightness-110",
        pepper: "bg-brand-gradient text-pepper-foreground hover:brightness-110 shadow-[0_14px_34px_-14px_var(--color-pepper)]",
        lime: "bg-lime-gradient text-lime-foreground hover:brightness-105 shadow-[0_14px_34px_-14px_var(--lime-to)]",
        sage: "bg-sage text-forest hover:bg-sage-strong",
        outline: "border border-foreground/20 bg-transparent text-foreground hover:border-foreground hover:bg-foreground hover:text-background",
        glass: "glass border border-border text-foreground hover:bg-surface",
        inverse: "bg-paper text-ink hover:bg-night hover:text-night-foreground",
        secondary: "bg-container text-foreground hover:bg-sage-strong",
        ghost: "text-foreground hover:bg-container",
        destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
        link: "rounded-none px-0 text-foreground link-line",
      },
      size: {
        default: "h-11 px-6 text-[0.9375rem]",
        sm: "h-9 px-4 text-sm",
        lg: "h-14 px-8 text-base",
        icon: "h-11 w-11",
        "icon-sm": "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
