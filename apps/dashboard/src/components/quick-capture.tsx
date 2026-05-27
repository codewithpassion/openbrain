import { api } from "@openbrains/convex/api";
import { useMutation } from "convex/react";
import { useState } from "react";
import { useActiveScope } from "../lib/active-scope";
import { validateCapture } from "./quick-capture-model";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";

function emptyMetadata() {
  return {
    topics: [] as string[],
    people: [] as string[],
    action_items: [] as string[],
    dates_mentioned: [] as string[],
  };
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function QuickCapture() {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const createThought = useMutation(api.thoughts.createThought);
  const { scope } = useActiveScope();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const result = validateCapture(content);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSubmitting(true);
    try {
      const fingerprint = await sha256Hex(result.content);
      await createThought({
        content: result.content,
        source: "dashboard",
        embeddingModel: "@cf/qwen/qwen3-embedding-0.6b",
        embeddingDims: 1024,
        fingerprint,
        metadata: emptyMetadata(),
        ...(scope === null ? {} : { scope }),
      });
      setContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Capture failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Capture a thought</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="capture">Thought</Label>
            <Textarea
              id="capture"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              rows={4}
              disabled={submitting}
            />
          </div>
          {error === null ? null : <p className="text-destructive text-sm">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Capture"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
