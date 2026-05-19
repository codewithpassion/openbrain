import { describe, expect, test } from "bun:test";
import {
  type BrainDumpSplitter,
  createFakeBrainDumpSplitter,
  createFakeEmbedder,
  createFakeMetadataExtractor,
} from "@openbrains/ingest";
import { panBrainDumpOutputSchema } from "@openbrains/shared";
import { createVectorizeClient } from "../../../src/deps/vectorize";
import { panBrainDumpHandler } from "../../../src/mcp/tools/pan-brain-dump";
import { makeAuthContext } from "../../helpers/auth";
import { makeFakeConvex, makeFakeVectorize } from "../../helpers/fakes";

function setup(userId: string, splitter: BrainDumpSplitter = createFakeBrainDumpSplitter()) {
  const convex = makeFakeConvex();
  const vectorize = createVectorizeClient(makeFakeVectorize());
  const embeddings = createFakeEmbedder({ dimensions: 1024 });
  return {
    envelope: {
      deps: {
        convex,
        vectorize,
        embeddings,
        metadata: createFakeMetadataExtractor(),
        splitter,
      },
      auth: makeAuthContext(userId),
    },
  };
}

describe("pan-brain-dump tool", () => {
  test("splits content via the injected splitter, respecting maxIdeas", async () => {
    const { envelope } = setup("u");
    const result = await panBrainDumpHandler(
      { content: "- write report\n- email Bob\n- learn Rust", maxIdeas: 2 },
      envelope,
    );
    const out = panBrainDumpOutputSchema.parse(result.structuredContent);
    expect(out.ideas.map((i) => i.content)).toEqual(["write report", "email Bob"]);
  });

  test("propagates type and topics from the splitter", async () => {
    const splitter: BrainDumpSplitter = {
      split: () =>
        Promise.resolve([{ content: "ship thing", type: "task", topics: ["work"] as const }]),
    };
    const { envelope } = setup("u", splitter);
    const result = await panBrainDumpHandler({ content: "anything" }, envelope);
    const out = panBrainDumpOutputSchema.parse(result.structuredContent);
    expect(out.ideas[0]?.type).toBe("task");
    expect(out.ideas[0]?.topics).toEqual(["work"]);
  });

  test("missing userId → isError", async () => {
    const { envelope } = setup("");
    const result = await panBrainDumpHandler({ content: "x" }, envelope);
    expect(result.isError).toBe(true);
  });

  test("invalid input → isError", async () => {
    const { envelope } = setup("u");
    const result = await panBrainDumpHandler({}, envelope);
    expect(result.isError).toBe(true);
  });
});
