import { Receiver } from "@upstash/qstash";
import { env } from "~/env";

/**
 * Verifies an inbound QStash webhook request. Constructs the Receiver *inside* this
 * function rather than at module scope deliberately — this repo's CI and pre-push hook
 * both build with SKIP_ENV_VALIDATION=1 and no secrets, and @upstash/qstash's own
 * `verifySignatureAppRouter` helper constructs its Receiver eagerly at the point a route
 * assigns `export const POST = verifySignatureAppRouter(...)`, which runs during
 * `next build`'s page-data-collection step and throws immediately when the signing keys
 * are undefined. Calling `new Receiver(...)` lazily, only when a real request comes in
 * (i.e. at runtime, where the real secrets are present), avoids that entirely.
 *
 * Reads the raw body once via `.text()` and verifies against that exact string — the
 * caller should `JSON.parse()` the returned `body` itself rather than calling
 * `request.json()`, since the body stream can only be read once.
 */
export async function verifyQstashRequest(
  request: Request,
): Promise<{ valid: true; body: string } | { valid: false; body: null }> {
  const body = await request.text();
  const signature = request.headers.get("upstash-signature");
  if (!signature) return { valid: false, body: null };

  const receiver = new Receiver({
    currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
  });

  try {
    const ok = await receiver.verify({ body, signature, url: request.url });
    return ok ? { valid: true, body } : { valid: false, body: null };
  } catch {
    return { valid: false, body: null };
  }
}
