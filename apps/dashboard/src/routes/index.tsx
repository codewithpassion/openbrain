import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { QuickCapture } from "../components/quick-capture";
import { ThoughtCard } from "../components/thought-card";
import type { ThoughtLike } from "../components/thought-card-model";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <>
      <Show when="signed-out">
        <div className="space-y-3">
          <h1 className="font-semibold text-2xl">OpenBrains</h1>
          <p className="text-muted-foreground text-sm">
            One persistent, governed memory across every AI client you use.
          </p>
          <Link
            to="/sign-in/$"
            params={{ _splat: "" }}
            className="font-medium text-sm underline-offset-4 hover:underline"
          >
            Sign in to continue
          </Link>
        </div>
      </Show>
      <Show when="signed-in">
        <Authenticated />
      </Show>
    </>
  );
}

function Authenticated() {
  const thoughts = useQuery(api.thoughts.listThoughts, { limit: 20 }) as ThoughtLike[] | undefined;
  return (
    <div className="space-y-8">
      <QuickCapture />
      <section className="space-y-3">
        <h2 className="font-semibold text-lg">Recent</h2>
        {thoughts === undefined ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : thoughts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No thoughts yet. Capture your first one above.
          </p>
        ) : (
          <div className="space-y-3">
            {thoughts.map((t) => (
              <ThoughtCard key={t._id} thought={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
