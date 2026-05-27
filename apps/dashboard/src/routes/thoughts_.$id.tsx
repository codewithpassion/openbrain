import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import type { Id } from "@openbrains/convex/dataModel";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import {
  buildThoughtDetailModel,
  type ProvenanceLike,
  type ReviewLike,
  type SourceRefLike,
  type ThoughtDetailLike,
  type ThoughtDetailModel,
  type UsePolicyLike,
} from "../components/thought-detail-model";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Textarea } from "../components/ui/textarea";

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const Route = createFileRoute("/thoughts_/$id")({ component: ThoughtDetailRoute });

function ThoughtDetailRoute() {
  return (
    <>
      <Show when="signed-out">
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in to view this thought
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
  const id = rawId as Id<"thoughts">;
  const thought = useQuery(api.thoughts.getThought, { id }) as ThoughtDetailLike | null | undefined;
  const provenance = useQuery(api.memory.provenance.list, { thoughtId: id }) as
    | ProvenanceLike[]
    | undefined;
  const usePolicy = useQuery(api.memory.usePolicy.get, { thoughtId: id }) as
    | UsePolicyLike
    | null
    | undefined;
  const sourceRefs = useQuery(api.memory.sourceRefs.list, { thoughtId: id }) as
    | SourceRefLike[]
    | undefined;
  const reviews = useQuery(api.memory.review.list, { thoughtId: id }) as ReviewLike[] | undefined;

  if (thought === undefined) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  if (thought === null) {
    return <p className="text-muted-foreground text-sm">Thought not found.</p>;
  }
  if (
    provenance === undefined ||
    usePolicy === undefined ||
    sourceRefs === undefined ||
    reviews === undefined
  ) {
    return <p className="text-muted-foreground text-sm">Loading sidecars…</p>;
  }

  const model = buildThoughtDetailModel({
    thought,
    provenance,
    usePolicy,
    sourceRefs,
    reviews,
  });

  return <Loaded id={id} thought={thought} model={model} />;
}

interface LoadedProps {
  readonly id: Id<"thoughts">;
  readonly thought: ThoughtDetailLike;
  readonly model: ThoughtDetailModel;
}

function Loaded({ id, thought, model }: LoadedProps) {
  const deleteThought = useMutation(api.thoughts.deleteThought);
  const promote = useMutation(api.memory.review.promote);
  const reembed = useMutation(api.thoughts.reembedThought);
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"delete" | "promote" | "reindex" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async () => {
    setError(null);
    setNotice(null);
    setBusy("delete");
    try {
      await deleteThought({ id });
      await navigate({ to: "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete");
      setBusy(null);
    }
  };

  const onPromote = async () => {
    setError(null);
    setNotice(null);
    setBusy("promote");
    try {
      await promote({ thoughtId: id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to promote");
    } finally {
      setBusy(null);
    }
  };

  const onReindex = async () => {
    setError(null);
    setNotice(null);
    setBusy("reindex");
    try {
      await reembed({ id });
      setNotice("Reindex queued. Search results refresh once the action completes.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reindex");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <Header model={model} />
      <ContentCard id={id} thought={thought} model={model} onError={setError} />
      <ActionItemsCard items={model.actionItems} />
      <TrustCard model={model} busy={busy} onPromote={onPromote} />
      <ProvenanceCard model={model} />
      <SourceRefsCard model={model} />
      <ReviewsCard model={model} />
      <TechnicalCard model={model} />
      <div className="flex items-center justify-between">
        <Link to="/" className="text-muted-foreground text-sm underline-offset-4 hover:underline">
          ← back
        </Link>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onReindex}
            disabled={busy === "reindex" || busy === "delete"}
          >
            {busy === "reindex" ? "Reindexing…" : "Reindex"}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onDelete}
            disabled={busy === "delete"}
          >
            {busy === "delete" ? "Deleting…" : "Delete thought"}
          </Button>
        </div>
      </div>
      {notice === null ? null : <p className="text-muted-foreground text-sm">{notice}</p>}
      {error === null ? null : <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
}

function Header({ model }: { readonly model: ThoughtDetailModel }) {
  return (
    <header className="space-y-2">
      <div className="flex items-center justify-between text-muted-foreground text-xs">
        <span className="rounded bg-muted px-2 py-0.5 font-medium uppercase tracking-wide">
          {model.typeLabel}
        </span>
        <span>
          {model.source} · created {model.createdLabel} · updated {model.updatedLabel}
        </span>
      </div>
      {model.topicsLine.length === 0 ? null : (
        <p className="text-muted-foreground text-xs">{model.topicsLine}</p>
      )}
    </header>
  );
}

interface ContentCardProps {
  readonly id: Id<"thoughts">;
  readonly thought: ThoughtDetailLike;
  readonly model: ThoughtDetailModel;
  readonly onError: (msg: string | null) => void;
}

function ContentCard({ id, thought, model, onError }: ContentCardProps) {
  const updateContent = useMutation(api.thoughts.updateContent);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft(thought.content);
    setEditing(true);
    onError(null);
  };

  const cancel = () => {
    setEditing(false);
    setDraft("");
    onError(null);
  };

  const save = async () => {
    if (draft.trim().length === 0) {
      onError("Content cannot be empty");
      return;
    }
    onError(null);
    setSaving(true);
    try {
      const fingerprint = await sha256Hex(draft.trim());
      const metadata: {
        topics: string[];
        people: string[];
        action_items: string[];
        dates_mentioned: string[];
        type?: string;
      } = {
        topics: [...thought.metadata.topics],
        people: [...thought.metadata.people],
        action_items: [...thought.metadata.action_items],
        dates_mentioned: [...thought.metadata.dates_mentioned],
      };
      if (thought.metadata.type !== undefined) {
        metadata.type = thought.metadata.type;
      }
      await updateContent({ id, content: draft, fingerprint, metadata });
      setEditing(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent>
        {editing ? (
          <div className="space-y-3">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              disabled={saving}
            />
            <p className="text-muted-foreground text-xs">
              Saving auto-queues a reindex. Search results refresh once the embedding job completes
              — usually within a few seconds.
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button type="button" variant="outline" onClick={cancel} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="whitespace-pre-wrap text-sm">{model.content}</p>
            <Button type="button" variant="outline" size="sm" onClick={startEdit}>
              Edit
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ActionItemsCard({ items }: { readonly items: readonly string[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Action items</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

interface TrustCardProps {
  readonly model: ThoughtDetailModel;
  readonly busy: "delete" | "promote" | "reindex" | null;
  readonly onPromote: () => Promise<void>;
}

function TrustCard({ model, busy, onPromote }: TrustCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Trust & scope</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p>
          <span className="text-muted-foreground">trust grade:</span> {model.trustGradeLabel}
          {model.scopesLine.length === 0 ? null : (
            <>
              {" "}
              · <span className="text-muted-foreground">scopes:</span> {model.scopesLine}
            </>
          )}
        </p>
        {model.canPromoteToInstruction ? (
          <Button type="button" onClick={onPromote} disabled={busy === "promote"} variant="default">
            {busy === "promote" ? "Promoting…" : "Promote to instruction"}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ProvenanceCard({ model }: { readonly model: ThoughtDetailModel }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Provenance</CardTitle>
      </CardHeader>
      <CardContent>
        {model.provenance.length === 0 ? (
          <p className="text-muted-foreground text-sm">No provenance recorded.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {model.provenance.map((p) => (
              <li key={p.id}>
                <span className="font-medium">{p.originLabel}</span>
                {p.agentLabel === null ? null : (
                  <span className="text-muted-foreground"> · {p.agentLabel}</span>
                )}
                <span className="text-muted-foreground"> · {p.capturedLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SourceRefsCard({ model }: { readonly model: ThoughtDetailModel }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Source refs</CardTitle>
      </CardHeader>
      <CardContent>
        {model.sourceRefs.length === 0 ? (
          <p className="text-muted-foreground text-sm">No source references.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {model.sourceRefs.map((s) => (
              <li key={s.id}>
                <span className="font-medium">{s.kind}</span>
                <span className="text-muted-foreground"> · {s.uri}</span>
                {s.excerpt === null ? null : (
                  <p className="mt-1 whitespace-pre-wrap text-muted-foreground text-xs">
                    {s.excerpt}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewsCard({ model }: { readonly model: ThoughtDetailModel }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review history</CardTitle>
      </CardHeader>
      <CardContent>
        {model.reviews.length === 0 ? (
          <p className="text-muted-foreground text-sm">No reviews yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {model.reviews.map((r) => (
              <li key={r.id}>
                <span className="font-medium">{r.statusLabel}</span>
                <span className="text-muted-foreground">
                  {" "}
                  · by {r.reviewer} · {r.reviewedLabel}
                </span>
                {r.note === null ? null : (
                  <p className="mt-1 text-muted-foreground text-xs">{r.note}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function TechnicalCard({ model }: { readonly model: ThoughtDetailModel }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Technical</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 text-muted-foreground text-xs">
        <p>id: {model.id}</p>
        <p>fingerprint: {model.fingerprintShort}…</p>
        <p>embedding: {model.embeddingLabel}</p>
      </CardContent>
    </Card>
  );
}
