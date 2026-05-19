import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import { tryParseBrainBundle } from "@openbrains/ingest/sources";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { buildImportRowModels, type ImportLike } from "../components/ingest-model";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { cn } from "../lib/cn";

export const Route = createFileRoute("/ingest")({ component: IngestRoute });

function IngestRoute() {
  return (
    <>
      <Show when="signed-out">
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in to manage imports
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
  const imports = useQuery(api.imports.listForUser, { limit: 50 }) as ImportLike[] | undefined;
  const models = imports === undefined ? [] : buildImportRowModels(imports);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl">Ingest</h1>
        <p className="text-muted-foreground text-sm">
          Backup and restore your brain, or pull thoughts in from external sources.
        </p>
      </header>

      <BackupCard />
      <RestoreCard />
      <SourcesCard />
      <HistoryCard rows={imports} models={models} />
    </div>
  );
}

function BackupCard() {
  const exporter = useQuery(api.brainBackup.exportForUser, {}) as
    | { version: number; userId: string; exportedAt: number; thoughts: unknown[] }
    | undefined;

  const download = () => {
    if (exporter === undefined) {
      return;
    }
    const blob = new Blob([JSON.stringify(exporter, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const date = new Date(exporter.exportedAt).toISOString().slice(0, 10);
    anchor.download = `openbrains-backup-${date}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brain backup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Download a JSON bundle of every thought + sidecar you own. Vectorize embeddings are not
          included — they're regenerable from content.
        </p>
        <Button type="button" onClick={download} disabled={exporter === undefined}>
          {exporter === undefined
            ? "Preparing…"
            : `Download (${exporter.thoughts.length} thoughts)`}
        </Button>
      </CardContent>
    </Card>
  );
}

const RESTORE_BATCH_SIZE = 50;

function RestoreCard() {
  const restore = useMutation(api.brainBackup.restoreForCaller);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file === undefined) {
      return;
    }
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const text = await file.text();
      const parsed = tryParseBrainBundle(JSON.parse(text));
      if (!parsed.ok) {
        setError(`Invalid bundle: ${parsed.error}`);
        return;
      }
      let imported = 0;
      let skipped = 0;
      for (let i = 0; i < parsed.bundle.thoughts.length; i += RESTORE_BATCH_SIZE) {
        const slice = parsed.bundle.thoughts.slice(i, i + RESTORE_BATCH_SIZE);
        const r = await restore({
          thoughts: slice.map((t) => ({
            content: t.content,
            source: t.source,
            embeddingModel: t.embeddingModel,
            embeddingDims: t.embeddingDims,
            fingerprint: t.fingerprint,
            metadata: {
              ...(t.metadata.type === undefined ? {} : { type: t.metadata.type }),
              topics: [...t.metadata.topics],
              people: [...t.metadata.people],
              action_items: [...t.metadata.action_items],
              dates_mentioned: [...t.metadata.dates_mentioned],
            },
            provenance: (t.provenance ?? []).map((p) => ({
              origin: p.origin,
              capturedAt: p.capturedAt,
              ...(p.agent === undefined ? {} : { agent: p.agent }),
              ...(p.agentVersion === undefined ? {} : { agentVersion: p.agentVersion }),
              ...(p.sessionId === undefined ? {} : { sessionId: p.sessionId }),
            })),
            sourceRefs: (t.sourceRefs ?? []).map((s) => ({
              kind: s.kind,
              uri: s.uri,
              ...(s.excerpt === undefined ? {} : { excerpt: s.excerpt }),
            })),
          })),
        });
        imported += r.imported;
        skipped += r.skipped;
      }
      setResult({ imported, skipped });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brain restore</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">
          Upload a JSON bundle from a previous backup (or another OpenBrains tenant). Thoughts
          matching an existing fingerprint are skipped — the local thought wins.
        </p>
        <input
          type="file"
          accept="application/json"
          onChange={onFile}
          disabled={busy}
          className="text-sm"
        />
        {result === null ? null : (
          <p className="text-muted-foreground text-sm">
            Imported {result.imported}, skipped {result.skipped}.
          </p>
        )}
        {error === null ? null : <p className="text-destructive text-sm">{error}</p>}
      </CardContent>
    </Card>
  );
}

function SourcesCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>External sources</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p className="text-muted-foreground">
          One-off importers from external apps. Each maps onto the shared <code>Importer</code>{" "}
          contract and writes through the <code>imports</code> job log.
        </p>
        <ul className="space-y-1">
          <li>
            <span className="font-medium">Gmail</span>{" "}
            <span className="text-muted-foreground">— OAuth integration pending</span>
          </li>
          <li>
            <span className="font-medium">Obsidian vault</span>{" "}
            <span className="text-muted-foreground">— planned</span>
          </li>
          <li>
            <span className="font-medium">ChatGPT export</span>{" "}
            <span className="text-muted-foreground">— planned</span>
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

function HistoryCard({
  rows,
  models,
}: {
  readonly rows: ImportLike[] | undefined;
  readonly models: ReturnType<typeof buildImportRowModels>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
      </CardHeader>
      <CardContent>
        {rows === undefined ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : models.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No imports yet. Restore a bundle above to populate this.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {models.map((m) => (
              <li key={m.id} className="space-y-1 rounded-md border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">
                    {m.source} <span className="text-muted-foreground">({m.direction})</span>
                  </span>
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
                  {m.statsLine} · {m.updatedLabel}
                </p>
                {m.note === null ? null : <p className="text-muted-foreground text-xs">{m.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
