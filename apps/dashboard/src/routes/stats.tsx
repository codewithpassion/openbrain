import { Show } from "@clerk/tanstack-react-start";
import type { ThoughtStatsOutput } from "@openbrains/shared";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "../components/ui/card";
import { thoughtStatsFn } from "../server/stats";

export const Route = createFileRoute("/stats")({ component: Stats });

function Stats() {
  return (
    <>
      <Show when="signed-out">
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in to see stats
        </Link>
      </Show>
      <Show when="signed-in">
        <Body />
      </Show>
    </>
  );
}

function Body() {
  const fetchStats = useServerFn(thoughtStatsFn);
  const [stats, setStats] = useState<ThoughtStatsOutput | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchStats({ data: {} })
      .then((s) => {
        if (!cancelled) {
          setStats(s);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load stats");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [fetchStats]);

  if (error !== null) {
    return <p className="text-destructive text-sm">{error}</p>;
  }
  if (stats === null) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-semibold text-2xl">Stats</h1>
        <p className="text-muted-foreground text-xs">Aggregate view of your captured thoughts.</p>
      </div>
      <Card>
        <CardHeader>
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Total</p>
        </CardHeader>
        <CardContent>
          <p className="font-semibold text-3xl">{stats.total}</p>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <StatList title="By type" items={byTypeRows(stats.byType)} />
        <StatList
          title="Top topics"
          items={stats.topTopics.map((t) => ({ label: t.topic, count: t.count }))}
        />
        <StatList
          title="Top people"
          items={stats.topPeople.map((p) => ({ label: p.person, count: p.count }))}
        />
      </div>
    </div>
  );
}

function byTypeRows(byType: Record<string, number>): { label: string; count: number }[] {
  return Object.entries(byType)
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

interface StatListProps {
  readonly title: string;
  readonly items: readonly { label: string; count: number }[];
}

function StatList({ title, items }: StatListProps) {
  return (
    <Card>
      <CardHeader>
        <p className="text-muted-foreground text-xs uppercase tracking-wide">{title}</p>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No data yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {items.map((item) => (
              <li key={item.label} className="flex items-center justify-between">
                <span>{item.label}</span>
                <span className="text-muted-foreground">{item.count}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
