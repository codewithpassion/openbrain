import { z } from "zod";

export const UserId = z.string().min(1).brand<"UserId">();
export type UserId = z.infer<typeof UserId>;

export const ThoughtId = z.string().min(1).brand<"ThoughtId">();
export type ThoughtId = z.infer<typeof ThoughtId>;

export const ApiKeyId = z.string().min(1).brand<"ApiKeyId">();
export type ApiKeyId = z.infer<typeof ApiKeyId>;
