/**
 * Pure data model for the ob-graph visual canvas.
 *
 * Splits the data wrangling from the rendering so the rendering layer
 * (react-force-graph-2d) stays a thin shell that can be tested with a
 * screenshot rather than by interrogating its internals. The model is
 * deterministic and side-effect-free.
 */

export interface EntityNodeInput {
  readonly _id: string;
  readonly kind: string;
  readonly canonicalName: string;
  readonly aliases: readonly string[];
  readonly updatedAt: number;
}

export interface RelationEdgeInput {
  readonly _id: string;
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly kind: string;
  readonly evidenceThoughtIds: readonly string[];
  readonly confidence: number;
  readonly updatedAt: number;
}

export interface GraphNode {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly color: string;
}

export interface GraphLink {
  readonly source: string;
  readonly target: string;
  readonly label: string;
  readonly confidence: number;
}

export interface GraphModel {
  readonly nodes: readonly GraphNode[];
  readonly links: readonly GraphLink[];
}

// Curated palette — same hues across sessions so the visual stays stable
// when a user opens the graph again. Add more entries as new kinds appear;
// unknown kinds fall back to slate.
const PALETTE: Readonly<Record<string, string>> = {
  person: "#60a5fa", // sky-400
  org: "#f59e0b", // amber-500
  topic: "#a78bfa", // violet-400
  habit: "#34d399", // emerald-400
  goal: "#f472b6", // pink-400
  place: "#fb7185", // rose-400
};

const FALLBACK_COLOR = "#64748b"; // slate-500

export function colorForKind(kind: string): string {
  return PALETTE[kind] ?? FALLBACK_COLOR;
}

export interface BuildGraphInput {
  readonly entities: readonly EntityNodeInput[];
  readonly relations: readonly RelationEdgeInput[];
}

export function buildGraphModel(input: BuildGraphInput): GraphModel {
  const byId = new Map<string, GraphNode>();
  for (const e of input.entities) {
    if (!byId.has(e._id)) {
      byId.set(e._id, {
        id: e._id,
        label: e.canonicalName,
        kind: e.kind,
        color: colorForKind(e.kind),
      });
    }
  }
  const links: GraphLink[] = [];
  for (const r of input.relations) {
    if (!(byId.has(r.fromEntityId) && byId.has(r.toEntityId))) {
      continue;
    }
    links.push({
      source: r.fromEntityId,
      target: r.toEntityId,
      label: r.kind,
      confidence: r.confidence,
    });
  }
  return { nodes: [...byId.values()], links };
}
