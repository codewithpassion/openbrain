import { Show } from "@clerk/tanstack-react-start";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ApiKeyList } from "../components/api-key-list";
import { NewApiKeyDialog } from "../components/new-api-key-dialog";

export const Route = createFileRoute("/api-keys")({ component: ApiKeys });

function ApiKeys() {
  return (
    <>
      <Show when="signed-out">
        <Link
          to="/sign-in/$"
          params={{ _splat: "" }}
          className="font-medium text-sm underline-offset-4 hover:underline"
        >
          Sign in to manage keys
        </Link>
      </Show>
      <Show when="signed-in">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="font-semibold text-2xl">API keys</h1>
            <NewApiKeyDialog />
          </div>
          <ApiKeyList />
        </div>
      </Show>
    </>
  );
}
