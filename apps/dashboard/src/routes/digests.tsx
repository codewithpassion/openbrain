import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { buildDigestRowModels, type DigestLike } from "../components/digest-list-model";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export const Route = createFileRoute("/digests")({ component: DigestsRoute });

function DigestsRoute() {
  return (
    <>
      <Show when="signed-out">
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in to view digests
        </Link>
      </Show>
      <Show when="signed-in">
        <Body />
      </Show>
    </>
  );
}

function Body() {
  const rows = useQuery(api.digests.listForUser, { limit: 30 }) as DigestLike[] | undefined;
  const regenerate = useAction(api.digestsAction.regenerateForMe);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const models = rows === undefined ? [] : buildDigestRowModels(rows);

  const onRegenerate = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const out = await regenerate({});
      setStatus(
        out.status === "success"
          ? `Generated digest from ${out.thoughtCount} thought(s).`
          : out.status === "skipped"
            ? "Skipped — OPENROUTER_API_KEY not set."
            : "Generation failed. See the Jobs page.",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-semibold text-2xl">Digests</h1>
          <p className="text-muted-foreground text-sm">
            Daily summaries of your captured thoughts. Stored locally — email and Slack delivery
            come later.
          </p>
        </div>
        <Button type="button" onClick={onRegenerate} disabled={busy}>
          {busy ? "Generating…" : "Regenerate now"}
        </Button>
      </header>

      {status === null ? null : <p className="text-muted-foreground text-sm">{status}</p>}

      {rows === undefined ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : models.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              No digests yet. Click "Regenerate now" once you've captured a few thoughts.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {models.map((m) => (
            <Card key={m.id}>
              <CardHeader>
                <CardTitle>{m.date}</CardTitle>
                <p className="text-muted-foreground text-xs">
                  {m.countLabel} · generated {m.generatedLabel} · {m.generator}
                </p>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap font-sans text-sm">{m.summary}</pre>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
