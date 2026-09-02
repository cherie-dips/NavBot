/**
 * Message to show a user for a caught error.
 *
 * Every call site was writing `catch (err: any) { setError(err?.message || "...") }`,
 * which typed the error as `any` purely to reach `.message`. This narrows properly and
 * keeps the fallback wording where it belongs — at the call site.
 */
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}
