import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useState } from "react";
import {
  buildInspectorRowModels,
  type InspectorFilter,
  type InspectorReviewLike,
  nextInspectorFilter,
} from "../components/inspector-model";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { cn } from "../lib/cn";

export const Route = createFileRoute("/inspector")({ component: InspectorRoute });

function InspectorRoute() {
  return (
    <>
      <Show when="signed-out">
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in to inspect memory
        </Link>
      </Show>
      <Show when="signed-in">
        <Body />
      </Show>
    </>
  );
}

const FILTER_OPTIONS: readonly { value: InspectorFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unreviewed", label: "Unreviewed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "needs_revision", label: "Needs revision" },
  { value: "rejected", label: "Rejected" },
];

const BADGE_CLASSES = {
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  danger: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  neutral: "bg-muted text-muted-foreground",
};

function Body() {
  const [filter, setFilter] = useState<InspectorFilter>("all");
  const queryArgs = filter === "all" ? {} : { status: filter };
  const rows = useQuery(api.memory.review.listForUser, queryArgs) as
    | InspectorReviewLike[]
    | undefined;

  const models = rows === undefined ? [] : buildInspectorRowModels(rows);

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <h1 className="font-semibold text-2xl">Memory inspector</h1>
        <p className="text-muted-foreground text-sm">
          Review and promote agent-inferred memory. New evidence-grade entries default to{" "}
          <code>evidence</code>; promotion to <code>instruction</code> happens from a thought's
          detail page after the review is <code>confirmed</code>.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setFilter(nextInspectorFilter(filter, opt.value))}
            className={cn(
              "rounded-md border px-3 py-1 text-sm",
              filter === opt.value
                ? "border-foreground bg-foreground text-background"
                : "border-input bg-background hover:bg-accent hover:text-accent-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reviews</CardTitle>
        </CardHeader>
        <CardContent>
          {rows === undefined ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : models.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No reviews matching this filter. Capture or recall some thoughts via MCP to populate
              this list.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {models.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded px-2 py-0.5 font-medium text-xs uppercase tracking-wide",
                          BADGE_CLASSES[m.statusKind],
                        )}
                      >
                        {m.statusLabel}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        by {m.reviewer} · {m.relativeTime}
                      </span>
                    </div>
                    {m.note === null ? null : (
                      <p className="text-muted-foreground text-xs">{m.note}</p>
                    )}
                  </div>
                  <Link
                    to="/thoughts/$id"
                    params={{ id: m.thoughtId }}
                    className="text-sm underline-offset-4 hover:underline"
                  >
                    open →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
