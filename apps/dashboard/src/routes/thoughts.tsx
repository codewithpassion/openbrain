import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ThoughtCard } from "../components/thought-card";
import type { ThoughtLike } from "../components/thought-card-model";

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
  const thoughts = useQuery(api.thoughts.listThoughts, { limit: 200 }) as ThoughtLike[] | undefined;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-semibold text-2xl">All thoughts</h1>
        <p className="text-muted-foreground text-xs">
          Most recent 200 thoughts. Use{" "}
          <Link to="/search" className="underline">
            Search
          </Link>{" "}
          for semantic lookup.
        </p>
      </div>
      <div className="space-y-3">
        {thoughts === undefined ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : thoughts.length === 0 ? (
          <p className="text-muted-foreground text-sm">No thoughts yet.</p>
        ) : (
          thoughts.map((t) => <ThoughtCard key={t._id} thought={t} />)
        )}
      </div>
    </div>
  );
}
