import { ClerkProvider, Show, UserButton, useAuth } from "@clerk/tanstack-react-start";
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { Brain, Menu } from "lucide-react";
import { useState } from "react";
import { AppSidebar } from "../components/app-sidebar";
import { ProjectSwitcher } from "../components/project-switcher";
import { Button } from "../components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "../components/ui/sheet";
import { getClientEnv } from "../env";
import { getConvexClient } from "../lib/convex";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "OpenBrains" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootDocument,
});

function RootDocument() {
  const { VITE_CLERK_PUBLISHABLE_KEY } = getClientEnv();
  const convex = getConvexClient();
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ClerkProvider publishableKey={VITE_CLERK_PUBLISHABLE_KEY}>
          <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            <Shell />
          </ConvexProviderWithClerk>
        </ClerkProvider>
        <Scripts />
      </body>
    </html>
  );
}

function Shell() {
  return (
    <>
      <Show when="signed-in">
        <AuthedShell />
      </Show>
      <Show when="signed-out">
        <PublicShell />
      </Show>
    </>
  );
}

function AuthedShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r bg-muted/30 lg:flex lg:flex-col">
        <AppSidebar />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md md:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Open navigation"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <AppSidebar onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <Link to="/" className="flex items-center gap-2 lg:hidden">
            <span
              aria-hidden
              className="grid h-7 w-7 place-items-center rounded-md bg-foreground text-background"
            >
              <Brain className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            <span className="font-semibold text-sm">OpenBrains</span>
          </Link>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <ProjectSwitcher />
            <UserButton />
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8 md:py-10">
          <div className="mx-auto w-full max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

function PublicShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-14 items-center justify-between border-b px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid h-8 w-8 place-items-center rounded-md bg-foreground text-background"
          >
            <Brain className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <span className="font-semibold text-base">OpenBrains</span>
        </Link>
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="mx-auto w-full max-w-3xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
