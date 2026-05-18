import { ClerkProvider, Show, UserButton, useAuth } from "@clerk/tanstack-react-start";
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { ConvexProviderWithClerk } from "convex/react-clerk";
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
      <body className="min-h-screen bg-background text-foreground">
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
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <nav className="flex items-center gap-4 font-medium text-sm">
          <Link to="/" className="font-semibold text-base">
            OpenBrains
          </Link>
          <Show when="signed-in">
            <Link to="/" className="text-muted-foreground hover:text-foreground">
              Capture
            </Link>
            <Link to="/search" className="text-muted-foreground hover:text-foreground">
              Search
            </Link>
            <Link to="/api-keys" className="text-muted-foreground hover:text-foreground">
              API Keys
            </Link>
          </Show>
        </nav>
        <div>
          <Show when="signed-in">
            <UserButton />
          </Show>
          <Show when="signed-out">
            <Link
              to="/sign-in/$"
              params={{ _splat: "" }}
              className="font-medium text-sm underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </Show>
        </div>
      </header>
      <main className="flex-1 px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
