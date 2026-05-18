import { OpenBrainsError } from "@openbrains/shared";

export interface EmbeddingResult {
  readonly vector: readonly number[];
  readonly dimensions: number;
  readonly model: string;
  readonly tokenCount?: number;
}

export interface EmbeddingAdapter {
  readonly model: string;
  readonly dimensions: number;
  readonly maxInputTokens: number;
  embed(content: string): Promise<EmbeddingResult>;
  embedBatch(contents: readonly string[]): Promise<readonly EmbeddingResult[]>;
}

export class EmbeddingError extends OpenBrainsError {
  public constructor(message: string, options?: ErrorOptions) {
    super("embedding_error", message, options);
    this.name = "EmbeddingError";
  }
}
