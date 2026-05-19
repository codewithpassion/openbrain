import { auth } from "@clerk/tanstack-react-start/server";
import {
  ServiceAuthError,
  ServiceInputError,
  searchThoughts as searchThoughtsService,
} from "@openbrains/services";
import {
  type SearchThoughtsInput,
  type SearchThoughtsOutput,
  searchThoughtsInputSchema,
} from "@openbrains/shared";
import { createServerFn } from "@tanstack/react-start";
import { buildServiceDeps } from "./deps";

export const searchThoughtsFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown): SearchThoughtsInput => {
    return searchThoughtsInputSchema.parse(data);
  })
  .handler(async ({ data }): Promise<SearchThoughtsOutput> => {
    const { userId } = await auth();
    if (userId === null || userId === undefined || userId === "") {
      throw new ServiceAuthError("not signed in");
    }
    try {
      return await searchThoughtsService(buildServiceDeps(), userId, data);
    } catch (e) {
      if (e instanceof ServiceInputError) {
        throw new Error(e.message);
      }
      throw e;
    }
  });
