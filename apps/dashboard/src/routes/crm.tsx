import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { formatRelativeTime } from "../lib/format";

export const Route = createFileRoute("/crm")({ component: CrmRoute });

interface EntityDoc {
  readonly _id: string;
  readonly canonicalName: string;
  readonly kind: string;
  readonly aliases: readonly string[];
  readonly updatedAt: number;
}

function CrmRoute() {
  return (
    <>
      <Show when="signed-out">
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in to view CRM
        </Link>
      </Show>
      <Show when="signed-in">
        <Body />
      </Show>
    </>
  );
}

function Body() {
  const people = useQuery(api.crm.listPeople, { limit: 200 }) as EntityDoc[] | undefined;
  const orgs = useQuery(api.crm.listOrgs, { limit: 200 }) as EntityDoc[] | undefined;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl">CRM</h1>
        <p className="text-muted-foreground text-sm">
          People and orgs extracted from your captured thoughts, plus the meetings/calls/emails
          you've recorded.
        </p>
      </header>

      <EntityListCard
        title="People"
        rows={people}
        emptyText="No people yet. The entity extractor will populate this as you capture thoughts that mention names."
      />
      <EntityListCard title="Orgs" rows={orgs} emptyText="No orgs yet." />
    </div>
  );
}

function EntityListCard({
  title,
  rows,
  emptyText,
}: {
  readonly title: string;
  readonly rows: EntityDoc[] | undefined;
  readonly emptyText: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows === undefined ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{emptyText}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {rows.map((r) => (
              <li key={r._id} className="flex items-baseline justify-between gap-3">
                <Link
                  to="/entities/$id"
                  params={{ id: r._id }}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {r.canonicalName}
                </Link>
                <span className="text-muted-foreground text-xs">
                  updated {formatRelativeTime(r.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
