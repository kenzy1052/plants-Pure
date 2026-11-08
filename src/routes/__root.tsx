import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { themeBootScript } from "../lib/theme";
import { AuthProvider } from "../lib/auth";
import { useCart } from "../lib/cart-store";
import { Header } from "../components/site/Header";
import { Footer } from "../components/site/Footer";
import { Cursor } from "../components/site/Cursor";
import { Intro } from "../components/site/Intro";
import { CartDrawer } from "../components/shop/CartDrawer";
import { Toaster } from "../components/ui/sonner";
import { Button } from "../components/ui/button";

function NotFoundComponent() {
  return (
    <div className="container-page flex min-h-[80vh] flex-col items-center justify-center pt-24 text-center">
      <p className="type-label text-muted-foreground">Error 404</p>
      <h1 className="type-page mt-4">This page wandered off.</h1>
      <p className="type-body mt-4 max-w-md text-muted-foreground">The page you're looking for doesn't exist or has been moved.</p>
      <div className="mt-8 flex gap-3">
        <Button asChild>
          <Link to="/">Go home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/shop">Browse the shop</Link>
        </Button>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="container-page flex min-h-[80vh] flex-col items-center justify-center pt-24 text-center">
      <h1 className="type-section">This page didn't load</h1>
      <p className="type-body mt-3 text-muted-foreground">Something went wrong on our end. You can try again or head back home.</p>
      <div className="mt-8 flex gap-3">
        <Button
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          Try again
        </Button>
        <Button asChild variant="outline">
          <a href="/">Go home</a>
        </Button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#b50606" },
      { property: "og:site_name", content: "Plants & Pure" },
      { property: "og:locale", content: "en_GH" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Inter:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,300..700;1,6..72,300..500&display=swap",
      },
      { rel: "preconnect", href: "https://res.cloudinary.com" },
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "256x256" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
    scripts: [{ children: themeBootScript }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GH" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function PageTransition({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hash = useRouterState({ select: (s) => s.location.hash });
  useEffect(() => {
    // Jump straight to the top on a new page (no smooth scroll), but let #anchors do their own scrolling.
    if (!hash) window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname, hash]);
  return (
    <div key={pathname} className="animate-in fade-in slide-in-from-bottom-2 duration-700 ease-[var(--ease-settle)]">
      {children}
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (pathname !== "/") return;
    document.documentElement.setAttribute("data-intro-seen", "");
    try {
      sessionStorage.setItem("pp-intro-seen", "1");
    } catch {
      /* storage unavailable */
    }
  }, [pathname]);
  useEffect(() => {
    void useCart.persist.rehydrate();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-foreground focus:px-4 focus:py-2 focus:text-background">
          Skip to content
        </a>
        {pathname !== "/" && <Intro />}
        <Header />
        <main id="main" className="min-h-screen">
          <PageTransition>
            <Outlet />
          </PageTransition>
        </main>
        <Footer />
        <CartDrawer />
        <Toaster position="bottom-center" />
        <Cursor />
      </AuthProvider>
    </QueryClientProvider>
  );
}
