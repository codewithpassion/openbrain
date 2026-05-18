import { api } from "@openbrains/convex/api";
import type { Id } from "@openbrains/convex/dataModel";
import { useMutation, useQuery } from "convex/react";
import { type ApiKeyLike, buildApiKeyRowModel } from "./api-key-row-model";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

interface ApiKeyRow extends ApiKeyLike {
  readonly _id: Id<"api_keys">;
}

export function ApiKeyList() {
  const keys = useQuery(api.apiKeys.list) as ApiKeyRow[] | undefined;
  const revoke = useMutation(api.apiKeys.revoke);

  if (keys === undefined) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }
  if (keys.length === 0) {
    return <p className="text-muted-foreground text-sm">No keys yet. Mint one to get started.</p>;
  }

  return (
    <div className="space-y-3">
      {keys.map((key) => {
        const model = buildApiKeyRowModel(key);
        return (
          <Card key={model.id}>
            <CardContent className="flex items-center justify-between gap-4 p-4">
              <div className="space-y-1">
                <p className="font-medium text-sm">{model.name}</p>
                <p className="text-muted-foreground text-xs">{model.scopesLabel}</p>
                <p className="text-muted-foreground text-xs">
                  created {model.createdLabel} · {model.lastUsedLabel}
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  void revoke({ id: key._id });
                }}
              >
                Revoke
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
