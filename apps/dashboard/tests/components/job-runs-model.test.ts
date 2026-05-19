import { describe, expect, it } from "bun:test";
import { buildJobRunRowModels, type JobRunLike } from "../../src/components/job-runs-model";

const NOW = Date.UTC(2026, 4, 19, 12, 0, 0);

function makeRun(over: Partial<JobRunLike>): JobRunLike {
  return {
    _id: "r0",
    name: "digests.daily",
    userId: "u1",
    status: "success",
    startedAt: NOW - 60_000,
    finishedAt: NOW - 30_000,
    ...over,
  };
}

describe("buildJobRunRowModels", () => {
  it("scopes are derived from the presence of userId", () => {
    const [user, global] = buildJobRunRowModels(
      [makeRun({}), makeRun({ _id: "r1", userId: undefined })],
      NOW,
    );
    expect(user?.scope).toBe("user");
    expect(global?.scope).toBe("global");
  });

  it("maps status to a badge kind", () => {
    const out = buildJobRunRowModels(
      [
        makeRun({ status: "success" }),
        makeRun({ _id: "r1", status: "failure" }),
        makeRun({ _id: "r2", status: "skipped" }),
      ],
      NOW,
    );
    expect(out.map((r) => r.statusKind)).toEqual(["success", "danger", "warning"]);
  });

  it("computes a non-negative duration", () => {
    const [row] = buildJobRunRowModels([makeRun({ startedAt: 200, finishedAt: 100 })], NOW);
    expect(row?.durationMs).toBe(0);
    const [row2] = buildJobRunRowModels([makeRun({ startedAt: 100, finishedAt: 800 })], NOW);
    expect(row2?.durationMs).toBe(700);
  });

  it("emits null for missing notes", () => {
    const [row] = buildJobRunRowModels([makeRun({ note: undefined })], NOW);
    expect(row?.note).toBe(null);
  });
});
