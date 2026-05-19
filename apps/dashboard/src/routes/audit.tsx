import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { type AuditRowLike, buildAuditRowModels } from "../components/audit-model";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export const Route = createFileRoute("/audit")({ component: AuditRoute });

function AuditRoute() {
  return (
    <>
      <Show when="signed-out">
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in to view the audit log
        </Link>
      </Show>
      <Show when="signed-in">
        <Body />
      </Show>
    </>
  );
}

function Body() {
  const rows = useQuery(api.memory.audit.list, { limit: 100 }) as AuditRowLike[] | undefined;
  const models = rows === undefined ? [] : buildAuditRowModels(rows);

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <h1 className="font-semibold text-2xl">Audit log</h1>
        <p className="text-muted-foreground text-sm">
          Every mutation that touches your memory. Diffs are compacted; click into a thought for
          full provenance.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          {rows === undefined ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : models.length === 0 ? (
            <p className="text-muted-foreground text-sm">No audit entries yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {models.map((m) => (
                <li key={m.id} className="space-y-1 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium font-mono text-xs">{m.action}</span>
                    <span className="text-muted-foreground text-xs">
                      by {m.actor} · {m.relativeTime}
                    </span>
                  </div>
                  {m.thoughtId === null ? null : (
                    <Link
                      to="/thoughts/$id"
                      params={{ id: m.thoughtId }}
                      className="text-muted-foreground text-xs underline-offset-4 hover:underline"
                    >
                      thought {m.thoughtId.slice(0, 12)}…
                    </Link>
                  )}
                  <pre className="overflow-x-auto whitespace-pre-wrap break-words text-muted-foreground text-xs">
                    {m.diffSummary}
                  </pre>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
