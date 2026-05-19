import { Show } from "@clerk/tanstack-react-start";
import { api } from "@openbrains/convex/api";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import {
  buildGraphModel,
  colorForKind,
  type EntityNodeInput as EntityLike,
  type GraphLink,
  type GraphNode,
} from "../components/graph-model";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export const Route = createFileRoute("/graph")({ component: GraphRoute });

function GraphRoute() {
  return (
    <>
      <Show when="signed-out">
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in to view your graph
        </Link>
      </Show>
      <Show when="signed-in">
        <Body />
      </Show>
    </>
  );
}

interface RelationLike {
  readonly _id: string;
  readonly fromEntityId: string;
  readonly toEntityId: string;
  readonly kind: string;
  readonly evidenceThoughtIds: readonly string[];
  readonly confidence: number;
  readonly updatedAt: number;
}

function Body() {
  const entities = useQuery(api.entities.listForUser, { limit: 500 }) as EntityLike[] | undefined;
  const allRelations = useQuery(api.entities.relationsForUser, { limit: 1000 }) as
    | RelationLike[]
    | undefined;

  if (entities === undefined || allRelations === undefined) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl">Graph</h1>
        <p className="text-muted-foreground text-sm">
          Force-directed view of your entities and typed relations. Drag a node to reposition; click
          to focus.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>
            ob-graph — {entities.length} entities · {allRelations.length} relations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entities.length === 0 ? (
            <p className="text-muted-foreground text-sm">No entities yet.</p>
          ) : (
            <Canvas entities={entities} relations={allRelations} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface CanvasProps {
  entities: readonly EntityLike[];
  relations: readonly RelationLike[];
}

function Canvas({ entities, relations }: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<ForceGraphMethods<GraphNode, GraphLink> | undefined>(undefined);
  const [size, setSize] = useState({ width: 800, height: 520 });

  const model = useMemo(() => buildGraphModel({ entities, relations }), [entities, relations]);

  useEffect(() => {
    if (containerRef.current === null) {
      return;
    }
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: 520 });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, []);

  const data = useMemo(
    () => ({
      nodes: model.nodes.map((n) => ({ ...n })),
      links: model.links.map((l) => ({ ...l })),
    }),
    [model],
  );

  const kinds = useMemo(() => {
    const set = new Set(model.nodes.map((n) => n.kind));
    return [...set].sort();
  }, [model]);

  return (
    <div className="space-y-3">
      <Legend kinds={kinds} />
      <div ref={containerRef} className="overflow-hidden rounded-md border bg-background">
        <ForceGraph2D
          ref={fgRef}
          graphData={data}
          width={size.width}
          height={size.height}
          nodeColor={(n) => (n as GraphNode).color}
          nodeLabel={(n) => `${(n as GraphNode).label} (${(n as GraphNode).kind})`}
          linkColor={() => "#94a3b8"}
          linkLabel={(l) => (l as GraphLink).label}
          linkWidth={(l) => Math.max(0.5, (l as GraphLink).confidence * 2)}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          cooldownTicks={60}
        />
      </div>
    </div>
  );
}

function Legend({ kinds }: { kinds: readonly string[] }) {
  if (kinds.length === 0) {
    return null;
  }
  return (
    <ul className="flex flex-wrap gap-3 text-sm">
      {kinds.map((k) => (
        <li key={k} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="inline-block size-3 rounded-full"
            style={{ backgroundColor: colorForKind(k) }}
          />
          <span className="text-muted-foreground">{k}</span>
        </li>
      ))}
    </ul>
  );
}
