import { buildThoughtCardModel, type ThoughtLike } from "./thought-card-model";
import { Card, CardContent, CardHeader } from "./ui/card";

interface ThoughtCardProps {
  readonly thought: ThoughtLike;
}

export function ThoughtCard({ thought }: ThoughtCardProps) {
  const model = buildThoughtCardModel(thought);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between text-muted-foreground text-xs">
          <span className="rounded bg-muted px-2 py-0.5 font-medium uppercase tracking-wide">
            {model.typeLabel}
          </span>
          <time>{model.relativeTime}</time>
        </div>
        {model.topicsLine.length > 0 ? (
          <p className="text-muted-foreground text-xs">{model.topicsLine}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap text-sm">{model.content}</p>
      </CardContent>
    </Card>
  );
}
