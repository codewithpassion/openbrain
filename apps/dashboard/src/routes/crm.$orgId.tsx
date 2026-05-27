import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import type { Id } from "@openbrains/convex/dataModel";
import { type OrgEntityMetadata, tryParseEntityMetadata } from "@openbrains/shared";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { formatRelativeTime } from "../lib/format";

export const Route = createFileRoute("/crm/$orgId")({ component: OrgDetailRoute });

interface EntityDoc {
  readonly _id: string;
  readonly kind: string;
  readonly canonicalName: string;
  readonly aliases: readonly string[];
  readonly metadata: unknown;
  readonly updatedAt: number;
}

interface InteractionDoc {
  readonly _id: string;
  readonly thoughtId: string;
  readonly kind: string;
  readonly at: number;
  readonly note?: string;
}

function OrgDetailRoute() {
  return (
    <>
      <Show when="signed-out">
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in to view this org
        </Link>
      </Show>
      <Show when="signed-in">
        <Body />
      </Show>
    </>
  );
}

function Body() {
  const { orgId: rawId } = Route.useParams();
  const id = rawId as Id<"entities">;
  const entity = useQuery(api.entities.getById, { id }) as EntityDoc | null | undefined;
  const interactions = useQuery(api.crm.interactionsForEntity, { entityId: id, limit: 100 }) as
    | InteractionDoc[]
    | undefined;

  if (entity === undefined) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  if (entity === null) {
    return <p className="text-muted-foreground text-sm">Org not found.</p>;
  }
  if (entity.kind !== "org") {
    return (
      <p className="text-muted-foreground text-sm">
        This entity is a {entity.kind}, not an org.{" "}
        <Link to="/entities/$id" params={{ id: entity._id }} className="underline">
          Open entity view →
        </Link>
      </p>
    );
  }

  const parsed = tryParseEntityMetadata(entity.metadata, entity.kind);
  const fields = parsed?.kind === "org" ? parsed.fields : null;

  return (
    <div className="space-y-6">
      <Header entity={entity} />
      <ProfileCard fields={fields} />
      <InteractionsCard interactions={interactions} />
      <Link to="/crm" className="text-muted-foreground text-sm underline-offset-4 hover:underline">
        ← back to CRM
      </Link>
    </div>
  );
}

function Header({ entity }: { readonly entity: EntityDoc }) {
  return (
    <header className="space-y-1">
      <h1 className="font-semibold text-2xl">{entity.canonicalName}</h1>
      {entity.aliases.length === 0 ? null : (
        <p className="text-muted-foreground text-xs">also: {entity.aliases.join(", ")}</p>
      )}
    </header>
  );
}

function ProfileCard({ fields }: { readonly fields: OrgEntityMetadata | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {fields === null ? (
          <p className="text-muted-foreground">
            No CRM details yet. Profile fields populate via the MCP-side update path.
          </p>
        ) : (
          <ProfileFields fields={fields} />
        )}
      </CardContent>
    </Card>
  );
}

function ProfileFields({ fields }: { readonly fields: OrgEntityMetadata }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
      <ProfileRow label="Industry" value={fields.industry} />
      <ProfileRow label="HQ" value={fields.hq} />
      {fields.headcount_estimate === undefined ? null : (
        <>
          <dt className="text-muted-foreground">Headcount</dt>
          <dd>~{fields.headcount_estimate.toLocaleString()}</dd>
        </>
      )}
      <ProfileRow label="Notes" value={fields.notes} />
    </dl>
  );
}

function ProfileRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | undefined;
}) {
  if (value === undefined) {
    return null;
  }
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

function InteractionsCard({
  interactions,
}: {
  readonly interactions: InteractionDoc[] | undefined;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Interactions</CardTitle>
      </CardHeader>
      <CardContent>
        {interactions === undefined ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : interactions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No interactions recorded.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {interactions.map((i) => (
              <li key={i._id} className="flex items-baseline justify-between gap-3">
                <div>
                  <span className="font-medium">{i.kind}</span>
                  {i.note === undefined ? null : (
                    <span className="text-muted-foreground"> · {i.note}</span>
                  )}
                </div>
                <Link
                  to="/thoughts/$id"
                  params={{ id: i.thoughtId }}
                  className="text-muted-foreground text-xs underline-offset-4 hover:underline"
                >
                  {formatRelativeTime(i.at)} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
