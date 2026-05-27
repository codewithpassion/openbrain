import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Brain, Search } from "lucide-react";
import { ThoughtCard } from "../components/thought-card";
import type { ThoughtLike } from "../components/thought-card-model";
import { useActiveScope } from "../lib/active-scope";

export const Route = createFileRoute("/thoughts")({ component: Thoughts });

function Thoughts() {
  return (
    <>
      <Show when="signed-out">
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in to view your thoughts
        </Link>
      </Show>
      <Show when="signed-in">
        <Body />
      </Show>
    </>
  );
}

function Body() {
  const { scope } = useActiveScope();
  const thoughts = useQuery(api.thoughts.listThoughts, {
    limit: 200,
    ...(scope === null ? {} : { scope }),
  }) as ThoughtLike[] | undefined;
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            Knowledge
          </p>
          <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">
            {scope === null ? "All thoughts" : scope}
          </h1>
          <p className="text-muted-foreground text-sm">
            Most recent 200 captures
            {thoughts === undefined ? null : ` · ${thoughts.length} shown`}.
          </p>
        </div>
        <Link
          to="/search"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 font-medium text-sm hover:bg-accent"
        >
          <Search className="h-4 w-4" />
          Semantic search
        </Link>
      </header>
      <ThoughtsGrid thoughts={thoughts} />
    </div>
  );
}

interface ThoughtsGridProps {
  readonly thoughts: ThoughtLike[] | undefined;
}

function ThoughtsGrid({ thoughts }: ThoughtsGridProps) {
  if (thoughts === undefined) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-lg border bg-muted/40"
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }
  if (thoughts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-6 py-16 text-center">
        <span
          aria-hidden
          className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground"
        >
          <Brain className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <p className="font-medium text-sm">No thoughts in this view yet</p>
        <p className="mt-1 max-w-xs text-muted-foreground text-xs">
          Capture a thought from the home screen or any connected AI client to see it here.
        </p>
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {thoughts.map((t) => (
        <Link
          key={t._id}
          to="/thoughts/$id"
          params={{ id: t._id }}
          className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ThoughtCard thought={t} />
        </Link>
      ))}
    </div>
  );
}
