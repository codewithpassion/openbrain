import { api } from "@openbrains/convex/api";
import { useMutation } from "convex/react";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useActiveScope } from "../lib/active-scope";
import { slugifyName, validateProjectInput } from "./new-project-dialog-model";
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

/**
 * Tiny "+" icon button next to the project switcher. Opens a Dialog that
 * collects name + slug (slug auto-derived from name unless the user types
 * over it), creates the project via `api.projects.create`, and pins the
 * new slug as the active scope on success.
 */
export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const create = useMutation(api.projects.create);
  const { setScope } = useActiveScope();

  function onNameChange(next: string) {
    setName(next);
    if (!slugTouched) {
      setSlug(slugifyName(next));
    }
  }

  function onSlugChange(next: string) {
    setSlug(next);
    setSlugTouched(true);
  }

  function reset() {
    setName("");
    setSlug("");
    setSlugTouched(false);
    setError(null);
  }

  function onOpenChange(next: boolean) {
    if (!next) {
      reset();
    }
    setOpen(next);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const result = validateProjectInput({ name, slug });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSubmitting(true);
    try {
      await create({ slug: result.slug, name: result.name });
      setScope(result.slug);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create project.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label="Create project"
          title="Create project"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Projects scope your captures. Pick a short slug — it appears in the URL and CLI.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Work"
              disabled={submitting}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-slug">Slug</Label>
            <Input
              id="project-slug"
              value={slug}
              onChange={(e) => onSlugChange(e.target.value)}
              placeholder="work"
              disabled={submitting}
              spellCheck={false}
            />
            <p className="text-muted-foreground text-xs">
              Lowercase alphanumeric + hyphens, max 64 characters.
            </p>
          </div>
          {error === null ? null : <p className="text-destructive text-sm">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
