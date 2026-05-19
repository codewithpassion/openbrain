/**
 * Brain bundle: a stable, JSON-serializable snapshot of a user's thoughts and
 * sidecars. Versioned so the restore path can refuse future shapes safely.
 */
export interface BrainBundle {
  readonly version: 1;
  readonly userId: string;
  readonly exportedAt: number;
  readonly thoughts: readonly BrainBundleThought[];
}

export interface BrainBundleThought {
  readonly id: string;
  readonly content: string;
  readonly source: string;
  readonly embeddingModel: string;
  readonly embeddingDims: number;
  readonly fingerprint: string;
  readonly createdAt: number;
  readonly metadata: {
    readonly type?: string;
    readonly topics: readonly string[];
    readonly people: readonly string[];
    readonly action_items: readonly string[];
    readonly dates_mentioned: readonly string[];
  };
  readonly provenance?: ReadonlyArray<{
    readonly origin: "human" | "agent_inferred" | "agent_generated" | "import";
    readonly agent?: string;
    readonly agentVersion?: string;
    readonly sessionId?: string;
    readonly capturedAt: number;
  }>;
  readonly sourceRefs?: ReadonlyArray<{
    readonly kind: string;
    readonly uri: string;
    readonly excerpt?: string;
  }>;
}

export interface ImporterStats {
  processed: number;
  created: number;
  skipped: number;
  errors: number;
}

/**
 * Importer contract. `begin` returns a resumable cursor; `nextBatch` returns
 * thought records (or null when done); `finalize` is called once at the end
 * for sources that need it (e.g. closing a stream).
 *
 * Sources don't talk to Convex directly — the orchestrator does that, so
 * importers stay testable and platform-neutral.
 */
export interface Importer {
  readonly source: string;
  begin(opts: { resumeCursor?: string }): Promise<{ cursor: string | null }>;
  nextBatch(
    cursor: string | null,
  ): Promise<{ items: readonly BrainBundleThought[]; nextCursor: string | null }>;
  finalize(): Promise<void>;
}
