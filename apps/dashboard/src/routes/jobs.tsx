import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { buildJobRunRowModels, type JobRunLike } from "../components/job-runs-model";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { cn } from "../lib/cn";

export const Route = createFileRoute("/jobs")({ component: JobsRoute });

function JobsRoute() {
  return (
    <>
      <Show when="signed-out">
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in to view scheduled jobs
        </Link>
      </Show>
      <Show when="signed-in">
        <Body />
      </Show>
    </>
  );
}

const BADGE_CLASSES = {
  success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  danger: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  neutral: "bg-muted text-muted-foreground",
};

function Body() {
  const rows = useQuery(api.jobs.listForUser, { limit: 100 }) as JobRunLike[] | undefined;
  const models = rows === undefined ? [] : buildJobRunRowModels(rows);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl">Scheduled jobs</h1>
        <p className="text-muted-foreground text-sm">
          Every action touching your data — capture-time entity extraction and classification,
          re-embeds on edit, daily digests, and briefings. Failures and skips show here too (if
          entity extraction is silently skipping, this is the place you'll see it).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Recent runs</CardTitle>
        </CardHeader>
        <CardContent>
          {rows === undefined ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : models.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No job runs yet. Capture a thought to trigger entity extraction; daily digests run
              once per day at 12:00 UTC.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {models.map((m) => (
                <li key={m.id} className="space-y-1 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium font-mono text-xs">{m.name}</span>
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 font-medium text-xs uppercase tracking-wide",
                        BADGE_CLASSES[m.statusKind],
                      )}
                    >
                      {m.statusLabel}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {m.scope === "user" ? "you" : "global"} · started {m.startedLabel} ·{" "}
                    {m.durationMs}ms
                  </p>
                  {m.note === null ? null : (
                    <p className="text-muted-foreground text-xs">{m.note}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
