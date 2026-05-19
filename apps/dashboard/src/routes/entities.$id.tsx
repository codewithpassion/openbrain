import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import type { Id } from "@openbrains/convex/dataModel";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export const Route = createFileRoute("/entities/$id")({ component: EntityDetailRoute });

interface EntityDoc {
  readonly _id: string;
  readonly kind: string;
  readonly canonicalName: string;
  readonly aliases: readonly string[];
}

interface MentionDoc {
  readonly _id: string;
  readonly thoughtId: string;
  readonly createdAt: number;
}

interface RelationDoc {
  readonly _id: string;
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly kind: string;
  readonly confidence: number;
}

function EntityDetailRoute() {
  return (
    <>
      <Show when="signed-out">
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in to view this entity
        </Link>
      </Show>
      <Show when="signed-in">
        <Body />
      </Show>
    </>
  );
}

function Body() {
  const { id: rawId } = Route.useParams();
  const id = rawId as Id<"entities">;
  const entity = useQuery(api.entities.getById, { id }) as EntityDoc | null | undefined;
  const mentions = useQuery(api.entities.mentionsForEntity, { entityId: id, limit: 50 }) as
    | MentionDoc[]
    | undefined;
  const relations = useQuery(api.entities.relationsForEntity, { entityId: id }) as
    | { outgoing: RelationDoc[]; incoming: RelationDoc[] }
    | undefined;

  if (entity === undefined) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  if (entity === null) {
    return <p className="text-muted-foreground text-sm">Entity not found.</p>;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl">{entity.canonicalName}</h1>
        <p className="text-muted-foreground text-sm">{entity.kind}</p>
        {entity.aliases.length === 0 ? null : (
          <p className="text-muted-foreground text-xs">also: {entity.aliases.join(", ")}</p>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Mentions</CardTitle>
        </CardHeader>
        <CardContent>
          {mentions === undefined ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : mentions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No mentions yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {mentions.map((m) => (
                <li key={m._id}>
                  <Link
                    to="/thoughts/$id"
                    params={{ id: m.thoughtId }}
                    className="underline-offset-4 hover:underline"
                  >
                    thought {m.thoughtId.slice(0, 12)}…
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Relations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {relations === undefined ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : relations.outgoing.length + relations.incoming.length === 0 ? (
            <p className="text-muted-foreground text-sm">No relations recorded.</p>
          ) : (
            <>
              {relations.outgoing.length > 0 ? (
                <div>
                  <p className="text-muted-foreground text-xs uppercase">outgoing</p>
                  <ul className="space-y-1 text-sm">
                    {relations.outgoing.map((r) => (
                      <li key={r._id}>
                        <span className="font-medium">{r.kind}</span> →{" "}
                        <Link
                          to="/entities/$id"
                          params={{ id: r.toEntityId }}
                          className="underline-offset-4 hover:underline"
                        >
                          {r.toEntityId.slice(0, 12)}…
                        </Link>
                        <span className="text-muted-foreground text-xs">
                          {" "}
                          · confidence {r.confidence.toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {relations.incoming.length > 0 ? (
                <div>
                  <p className="text-muted-foreground text-xs uppercase">incoming</p>
                  <ul className="space-y-1 text-sm">
                    {relations.incoming.map((r) => (
                      <li key={r._id}>
                        <Link
                          to="/entities/$id"
                          params={{ id: r.fromEntityId }}
                          className="underline-offset-4 hover:underline"
                        >
                          {r.fromEntityId.slice(0, 12)}…
                        </Link>{" "}
                        <span className="font-medium">{r.kind}</span> → here
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <Link
        to="/entities"
        className="text-muted-foreground text-sm underline-offset-4 hover:underline"
      >
        ← back to entities
      </Link>
    </div>
  );
}
