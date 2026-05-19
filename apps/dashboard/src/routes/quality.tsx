import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export const Route = createFileRoute("/quality")({ component: QualityRoute });

interface ReportShape {
  readonly totalThoughts: number;
  readonly flagged: ReadonlyArray<{
    readonly thoughtId: string;
    readonly reason: string;
    readonly content: string;
    readonly createdAt: number;
  }>;
  readonly counts: {
    readonly missingType: number;
    readonly emptyTopics: number;
    readonly noProvenance: number;
    readonly noEntities: number;
  };
}

function QualityRoute() {
  return (
    <>
      <Show when="signed-out">
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in to view the quality report
        </Link>
      </Show>
      <Show when="signed-in">
        <Body />
      </Show>
    </>
  );
}

function Body() {
  const report = useQuery(api.quality.reportForUser, { limit: 100 }) as ReportShape | undefined;
  if (report === undefined) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl">Quality audit</h1>
        <p className="text-muted-foreground text-sm">
          Thoughts the enrichment pipeline has not fully covered yet. Counts cover the latest 500
          captures; flagged rows are capped at 100.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            <li>
              Missing type: <span className="font-medium">{report.counts.missingType}</span>
            </li>
            <li>
              Empty topics: <span className="font-medium">{report.counts.emptyTopics}</span>
            </li>
            <li>
              No provenance: <span className="font-medium">{report.counts.noProvenance}</span>
            </li>
            <li>
              No entities: <span className="font-medium">{report.counts.noEntities}</span>
            </li>
          </ul>
          <p className="mt-2 text-muted-foreground text-xs">
            Scanned {report.totalThoughts} thoughts.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Flagged thoughts</CardTitle>
        </CardHeader>
        <CardContent>
          {report.flagged.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing to flag — clean brain.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {report.flagged.map((f) => (
                <li key={f.thoughtId} className="space-y-1 rounded-md border p-3">
                  <Link
                    to="/thoughts/$id"
                    params={{ id: f.thoughtId }}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {f.content}
                  </Link>
                  <p className="text-muted-foreground text-xs">{f.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
