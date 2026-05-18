import { api } from "@openbrains/convex/api";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const DEFAULT_SCOPES = ["capture", "search"] as const;

export function NewApiKeyDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const mint = useMutation(api.apiKeys.mint);

  async function onMint() {
    setError(null);
    if (name.trim().length === 0) {
      setError("Give the key a name.");
      return;
    }
    setSubmitting(true);
    try {
      const { rawKey: minted } = await mint({ name: name.trim(), scopes: [...DEFAULT_SCOPES] });
      setRawKey(minted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mint failed");
    } finally {
      setSubmitting(false);
    }
  }

  function onClose(next: boolean) {
    if (!next) {
      setRawKey(null);
      setName("");
      setError(null);
    }
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogTrigger asChild>
        <Button>New key</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{rawKey === null ? "Mint a new API key" : "Save this key now"}</DialogTitle>
          <DialogDescription>
            {rawKey === null
              ? "Scopes default to capture and search."
              : "We do not store the raw key. You will not be able to view it again."}
          </DialogDescription>
        </DialogHeader>
        {rawKey === null ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="laptop"
                disabled={submitting}
              />
            </div>
            {error === null ? null : <p className="text-destructive text-sm">{error}</p>}
          </div>
        ) : (
          <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">{rawKey}</pre>
        )}
        <DialogFooter>
          {rawKey === null ? (
            <Button onClick={onMint} disabled={submitting}>
              {submitting ? "Minting…" : "Mint"}
            </Button>
          ) : (
            <Button onClick={() => onClose(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
