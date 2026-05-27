import { api } from "@openbrains/convex/api";
import { useQuery } from "convex/react";
import { useActiveScope } from "../lib/active-scope";

interface ProjectRow {
  slug: string;
  name: string;
}

/**
 * Header dropdown that pins the active project (scope). "All projects"
 * (the null pin) means unscoped; selecting a slug filters every scope-aware
 * route to that project.
 *
 * Renders nothing until projects load — the chrome stays clean during the
 * first paint instead of flashing an empty select.
 */
export function ProjectSwitcher() {
  const projects = useQuery(api.projects.list, {}) as ProjectRow[] | undefined;
  const { scope, setScope } = useActiveScope();

  function onChange(event: React.ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value;
    setScope(next === "" ? null : next);
  }

  if (projects === undefined) {
    return null;
  }

  return (
    <label className="flex items-center gap-2 text-muted-foreground text-xs">
      <span className="sr-only">Active project</span>
      <select
        value={scope ?? ""}
        onChange={onChange}
        className="rounded border bg-background px-2 py-1 text-foreground"
        aria-label="Active project"
      >
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
