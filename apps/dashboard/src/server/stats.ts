import { auth } from "@clerk/tanstack-react-start/server";
import {
  ServiceAuthError,
  ServiceInputError,
  thoughtStats as thoughtStatsService,
} from "@openbrains/services";
import {
  type ThoughtStatsInput,
  type ThoughtStatsOutput,
  thoughtStatsInputSchema,
} from "@openbrains/shared";
import { createServerFn } from "@tanstack/react-start";
import { buildServiceDeps } from "./deps";

export const thoughtStatsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown): ThoughtStatsInput => thoughtStatsInputSchema.parse(data ?? {}))
  .handler(async ({ data }): Promise<ThoughtStatsOutput> => {
    const { userId } = await auth();
    if (userId === null || userId === undefined || userId === "") {
      throw new ServiceAuthError("not signed in");
    }
    try {
      return await thoughtStatsService(buildServiceDeps(), userId, data);
    } catch (e) {
      if (e instanceof ServiceInputError) {
        throw new Error(e.message);
      }
      throw e;
    }
  });
