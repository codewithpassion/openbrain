import { Show } from "@clerk/tanstack-react-start";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { ThoughtCard } from "../components/thought-card";
import type { ThoughtLike } from "../components/thought-card-model";
import { Input } from "../components/ui/input";
import { searchThoughtsFn } from "../server/search";

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

interface SearchResultRow {
  readonly id: string;
  readonly score: number;
  readonly content: string;
  readonly source: string;
  readonly createdAt: number;
}

function toThoughtLike(r: SearchResultRow): ThoughtLike {
  return {
    _id: r.id,
    content: r.content,
    createdAt: r.createdAt,
    metadata: { topics: [] },
  };
}

function Body() {
  const search = useServerFn(searchThoughtsFn);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [results, setResults] = useState<readonly SearchResultRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return;
    }
    setLoading(true);
    setError(null);
    setSubmitted(trimmed);
    try {
      const out = await search({ data: { query: trimmed } });
      setResults(out.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="font-semibold text-2xl">Search</h1>
        <p className="text-muted-foreground text-xs">
          Semantic search across all your thoughts. Press enter to query.
        </p>
        <form onSubmit={onSubmit}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your thoughts…"
          />
        </form>
      </div>
      <div className="space-y-3">
        {error === null ? (
          loading ? (
            <p className="text-muted-foreground text-sm">Searching…</p>
          ) : results === null ? (
            <p className="text-muted-foreground text-sm">Enter a query to search.</p>
          ) : results.length === 0 ? (
            <p className="text-muted-foreground text-sm">No matches for "{submitted}".</p>
          ) : (
            results.map((r) => (
              <Link
                key={r.id}
                to="/thoughts/$id"
                params={{ id: r.id }}
                className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="text-muted-foreground text-xs">
                  score {r.score.toFixed(3)} · {r.source}
                </p>
                <ThoughtCard thought={toThoughtLike(r)} />
              </Link>
            ))
          )
        ) : (
          <p className="text-destructive text-sm">{error}</p>
        )}
      </div>
    </div>
  );
}
