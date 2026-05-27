import { buildThoughtCardModel, type ThoughtLike } from "./thought-card-model";
import { Card, CardContent, CardHeader } from "./ui/card";

interface ThoughtCardProps {
  readonly thought: ThoughtLike;
}

export function ThoughtCard({ thought }: ThoughtCardProps) {
  const model = buildThoughtCardModel(thought);
  return (
    <Card className="h-full overflow-hidden transition-all hover:border-foreground/30 hover:shadow-sm">
      <CardHeader className="space-y-1.5 pb-3">
        <div className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-[10px] uppercase tracking-wide">
            {model.typeLabel}
          </span>
          <time className="tabular-nums">{model.relativeTime}</time>
        </div>
        {model.topicsLine.length > 0 ? (
          <p className="text-muted-foreground/80 text-xs">{model.topicsLine}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        <p className="line-clamp-5 whitespace-pre-wrap text-sm leading-relaxed">{model.content}</p>
      </CardContent>
    </Card>
  );
}
