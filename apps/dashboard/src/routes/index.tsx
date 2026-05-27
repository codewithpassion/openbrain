import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowRight, Brain, Sparkles } from "lucide-react";
import { QuickCapture } from "../components/quick-capture";
import { ThoughtCard } from "../components/thought-card";
import type { ThoughtLike } from "../components/thought-card-model";
import { Button } from "../components/ui/button";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <>
      <Show when="signed-out">
        <SignedOutHero />
      </Show>
      <Show when="signed-in">
        <Authenticated />
      </Show>
    </>
  );
}

function SignedOutHero() {
  return (
    <div className="space-y-8 py-12 text-center">
      <span
        aria-hidden
        className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-foreground text-background"
      >
        <Brain className="h-6 w-6" strokeWidth={2.5} />
      </span>
      <div className="space-y-3">
        <h1 className="font-semibold text-3xl tracking-tight md:text-4xl">OpenBrains</h1>
        <p className="mx-auto max-w-lg text-balance text-muted-foreground">
          One persistent, governed memory across every AI client you use — Claude, Codex, Cursor,
          ChatGPT.
        </p>
      </div>
      <div className="flex items-center justify-center gap-3">
        <Button asChild>
          <Link to="/sign-in/$" params={{ _splat: "" }}>
            Sign in
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}

function Authenticated() {
  const thoughts = useQuery(api.thoughts.listThoughts, { limit: 12 }) as ThoughtLike[] | undefined;
  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
          <span className="inline-flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            Capture
          </span>
        </p>
        <h1 className="font-semibold text-2xl tracking-tight md:text-3xl">What's on your mind?</h1>
      </header>
      <QuickCapture />
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold text-lg tracking-tight">Recent thoughts</h2>
          <Link
            to="/thoughts"
            className="inline-flex items-center gap-1 text-muted-foreground text-xs underline-offset-4 hover:text-foreground hover:underline"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <ThoughtsFeed thoughts={thoughts} />
      </section>
    </div>
  );
}

interface ThoughtsFeedProps {
  readonly thoughts: ThoughtLike[] | undefined;
}

function ThoughtsFeed({ thoughts }: ThoughtsFeedProps) {
  if (thoughts === undefined) {
    return <SkeletonList />;
  }
  if (thoughts.length === 0) {
    return <EmptyRecent />;
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

function SkeletonList() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-lg border bg-muted/40"
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

function EmptyRecent() {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 px-6 py-12 text-center">
      <span
        aria-hidden
        className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground"
      >
        <Brain className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <p className="font-medium text-sm">No thoughts yet</p>
      <p className="mt-1 max-w-xs text-muted-foreground text-xs">
        Capture your first thought above — it'll appear here and become searchable across every
        connected AI client.
      </p>
    </div>
  );
}
