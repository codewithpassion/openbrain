export interface ExtractedEntity {
  readonly canonicalName: string;
  readonly kind: string;
  readonly aliases?: readonly string[];
}

export interface ExtractedRelation {
  readonly fromCanonicalName: string;
  readonly toCanonicalName: string;
  readonly kind: string;
  readonly confidence?: number;
}

export interface ExtractionResult {
  readonly entities: readonly ExtractedEntity[];
  readonly relations: readonly ExtractedRelation[];
}

export interface EntityExtractor {
  extract(content: string): Promise<ExtractionResult>;
}
