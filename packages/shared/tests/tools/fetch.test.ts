import { describe, expect, test } from "bun:test";
import { fetchInputSchema, fetchOutputSchema } from "../../src/tools/fetch";

describe("fetchInputSchema (ChatGPT/connector compat)", () => {
  test("parses an id-only input", () => {
    const parsed = fetchInputSchema.parse({ id: "th_1" });
    const id: string = parsed.id;
    expect(id).toBe("th_1");
  });

  test("rejects empty id", () => {
    const result = fetchInputSchema.safeParse({ id: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["id"]);
    }
  });

  test("rejects missing id", () => {
    const result = fetchInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("fetchOutputSchema (ChatGPT/connector compat)", () => {
  test("parses a full document", () => {
    const parsed = fetchOutputSchema.parse({
      id: "th_1",
      title: "Notes",
      text: "Full body of the thought",
      url: "https://ob.example.com/t/th_1",
      metadata: { topics: ["typescript"] },
    });
    expect(parsed.text).toBe("Full body of the thought");
  });

  test("metadata is optional", () => {
    const parsed = fetchOutputSchema.parse({
      id: "th_1",
      title: "Notes",
      text: "x",
      url: "https://ob.example.com/t/th_1",
    });
    expect(parsed.metadata).toBeUndefined();
  });

  test("rejects empty text", () => {
    const result = fetchOutputSchema.safeParse({
      id: "th_1",
      title: "x",
      text: "",
      url: "https://ob.example.com/t/th_1",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["text"]);
    }
  });
});
