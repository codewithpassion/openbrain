import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";
import { ThoughtCard } from "../components/thought-card";
import { filterThoughts, type ThoughtLike } from "../components/thought-card-model";
import { Input } from "../components/ui/input";

export const Route = createFileRoute("/search")({ component: Search });

function Search() {
  return (
    <>
      <Show when="signed-out">
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in to search
        </Link>
      </Show>
      <Show when="signed-in">
        <Body />
      </Show>
    </>
  );
}

function Body() {
  const [query, setQuery] = useState("");
  const thoughts = useQuery(api.thoughts.listThoughts, { limit: 50 }) as ThoughtLike[] | undefined;
  const results = thoughts === undefined ? [] : filterThoughts(thoughts, query);
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="font-semibold text-2xl">Search</h1>
        <p className="text-muted-foreground text-xs">
          v1: client-side filter over the 50 most recent thoughts. Semantic search via Vectorize
          ships in v2.
        </p>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter recent thoughts…"
        />
      </div>
      <div className="space-y-3">
        {thoughts === undefined ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : results.length === 0 ? (
          <p className="text-muted-foreground text-sm">No matches.</p>
        ) : (
          results.map((t) => <ThoughtCard key={t._id} thought={t} />)
        )}
      </div>
    </div>
  );
}
