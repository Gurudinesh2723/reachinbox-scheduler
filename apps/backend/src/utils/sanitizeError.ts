/** Produces a client/log-safe error message, never leaking SMTP credentials or stack traces. */
export function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message.slice(0, 500);
  }
  return 'Unknown error';
}
