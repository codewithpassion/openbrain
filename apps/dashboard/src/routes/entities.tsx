import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  buildEntityRowModels,
  type EntityLike,
  groupByKind,
} from "../components/entity-list-model";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export const Route = createFileRoute("/entities")({ component: EntitiesRoute });

function EntitiesRoute() {
  return (
    <>
      <Show when="signed-out">
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in to browse entities
        </Link>
      </Show>
      <Show when="signed-in">
        <Body />
      </Show>
    </>
  );
}

function Body() {
  const rows = useQuery(api.entities.listForUser, { limit: 200 }) as EntityLike[] | undefined;
  const models = rows === undefined ? [] : buildEntityRowModels(rows);
  const groups = groupByKind(models);
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl">Entities</h1>
        <p className="text-muted-foreground text-sm">
          People, orgs, topics, places and products extracted from your thoughts. Click an entity
          for its mentions and relations.
        </p>
      </header>
      {rows === undefined ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              No entities yet. Capture more thoughts and the extractor will populate this page.
            </p>
          </CardContent>
        </Card>
      ) : (
        groups.map((g) => (
          <Card key={g.kind}>
            <CardHeader>
              <CardTitle className="capitalize">{g.kind}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {g.entities.map((e) => (
                  <li key={e.id} className="flex items-baseline justify-between gap-3">
                    <Link
                      to="/entities/$id"
                      params={{ id: e.id }}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {e.name}
                    </Link>
                    <span className="text-muted-foreground text-xs">{e.updatedLabel}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
