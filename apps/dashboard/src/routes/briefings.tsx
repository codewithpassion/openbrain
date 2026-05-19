import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { formatRelativeTime } from "../lib/format";

export const Route = createFileRoute("/briefings")({ component: BriefingsRoute });

interface BriefingDoc {
  readonly _id: string;
  readonly date: string;
  readonly summary: string;
  readonly sections: {
    readonly recent: readonly string[];
    readonly followUps: readonly string[];
    readonly openQuestions: readonly string[];
  };
  readonly generator: string;
  readonly generatedAt: number;
}

function BriefingsRoute() {
  return (
    <>
      <Show when="signed-out">
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in to view briefings
        </Link>
      </Show>
      <Show when="signed-in">
        <Body />
      </Show>
    </>
  );
}

function Body() {
  const rows = useQuery(api.briefings.listForUser, { limit: 30 }) as BriefingDoc[] | undefined;
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl">Briefings</h1>
        <p className="text-muted-foreground text-sm">
          Daily life-engine briefings. Each draws on your recent thoughts, your entity model, and
          your instruction-grade world model (if any).
        </p>
      </header>
      {rows === undefined ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              No briefings yet. The life engine fans out on the daily cron; you can also seed a
              world-model thought via <code>briefings.seedWorldModel</code> to anchor the briefing
              prompt.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((b) => (
            <Card key={b._id}>
              <CardHeader>
                <CardTitle>{b.date}</CardTitle>
                <p className="text-muted-foreground text-xs">
                  generated {formatRelativeTime(b.generatedAt)} · {b.generator}
                </p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="whitespace-pre-wrap">{b.summary}</p>
                <SectionList title="Recent" items={b.sections.recent} />
                <SectionList title="Follow-ups" items={b.sections.followUps} />
                <SectionList title="Open questions" items={b.sections.openQuestions} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionList({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly string[];
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <div>
      <p className="text-muted-foreground text-xs uppercase">{title}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
