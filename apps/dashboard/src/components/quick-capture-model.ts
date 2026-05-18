const MAX_THOUGHT_LENGTH = 50_000;

export type CaptureValidation =
  | { readonly ok: true; readonly content: string }
  | { readonly ok: false; readonly error: string };

/**
 * Local pre-flight validation for the quick-capture textarea. The Convex
 * mutation re-validates on the server (see `packages/shared/thoughts.ts`).
 * This exists purely so the dashboard can show an inline error without a
 * round-trip when the user hits an obvious bound.
 */
export function validateCapture(input: string): CaptureValidation {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Write something first." };
  }
  if (trimmed.length > MAX_THOUGHT_LENGTH) {
    return { ok: false, error: "Thought exceeds 50,000 characters." };
  }
  return { ok: true, content: trimmed };
}
