// A compact, searchable view of the REST v1 surface, derived from the OpenAPI document so it can't
// drift from it (TEMPLE-125). The full spec is ~150 KB — bigger than a bot's response cap — so a
// caller that only needs "which routes touch X" reads this index instead, then fetches a single
// tag's fragment (`buildSpecFragment`) when it needs a request/response shape.
//
// Dependency-free of the DB and of the spec builder itself: callers pass the spec in.
import { SCOPES, type Scope } from "~/lib/scopes";

const HTTP_METHODS = ["get", "put", "post", "delete", "patch"] as const;
type HttpMethod = (typeof HTTP_METHODS)[number];

/** The slice of an OpenAPI operation the index reads. */
interface SpecOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  security?: unknown[];
}

export interface SpecDocument {
  paths?: Record<string, Partial<Record<HttpMethod, SpecOperation>> | undefined>;
  components?: { schemas?: Record<string, unknown>; securitySchemes?: Record<string, unknown> };
}

export interface EndpointEntry {
  method: Uppercase<HttpMethod>;
  path: string;
  summary: string;
  tags: string[];
  operationId: string | null;
  /** "token" = needs `Authorization: Bearer <api token>`; "public" = open. */
  auth: "token" | "public";
  /** Scopes the operation's own description says it requires. Empty means a valid token is enough. */
  scopes: Scope[];
  /** False for routes that are deliberately not in the OpenAPI spec (the Templar contract is frozen
   *  — see the root AGENTS.md). They are listed here so a caller can still find them. */
  inSpec: boolean;
}

/** v1 routes that exist but are intentionally left out of the OpenAPI document. Kept honest by
 *  api-endpoint-index.test.ts, which fails when a route file is neither in the spec nor here. */
export const OFF_SPEC_ENDPOINTS: EndpointEntry[] = [
  {
    method: "POST",
    path: "/api/v1/softres",
    summary: "Create a SoftRes SR the way the bot's /sr does",
    tags: ["SoftRes"],
    operationId: null,
    auth: "token",
    scopes: ["softres:access"],
    inSpec: false,
  },
  {
    method: "POST",
    path: "/api/v1/admin/connections",
    summary: "Terminate idle database connections on demand",
    tags: ["Admin"],
    operationId: null,
    auth: "token",
    scopes: ["userpermissions:manage"],
    inSpec: false,
  },
];

const SCOPE_PATTERN = /\b([a-z-]+:(?:manage|access))\b/g;

function scopesMentioned(text: string): Scope[] {
  const found = new Set<Scope>();
  for (const match of text.matchAll(SCOPE_PATTERN)) {
    const candidate = match[1] as Scope;
    if ((SCOPES as readonly string[]).includes(candidate)) found.add(candidate);
  }
  return [...found];
}

export function buildEndpointIndex(spec: SpecDocument): EndpointEntry[] {
  const entries: EndpointEntry[] = [];
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    if (!item) continue;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;
      entries.push({
        method: method.toUpperCase() as EndpointEntry["method"],
        path,
        summary: op.summary ?? "",
        tags: op.tags ?? [],
        operationId: op.operationId ?? null,
        auth: op.security && op.security.length > 0 ? "token" : "public",
        scopes: scopesMentioned(`${op.summary ?? ""} ${op.description ?? ""}`),
        inSpec: true,
      });
    }
  }
  return [...entries, ...OFF_SPEC_ENDPOINTS];
}

export interface EndpointQuery {
  q?: string | null;
  tag?: string | null;
  method?: string | null;
}

/** Every whitespace-separated term in `q` must appear somewhere in the entry (path, summary, tags,
 *  operationId, scopes), case-insensitively. `tag` and `method` are exact, case-insensitive filters. */
export function searchEndpoints(entries: EndpointEntry[], query: EndpointQuery): EndpointEntry[] {
  const terms = (query.q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const tag = query.tag?.toLowerCase();
  const method = query.method?.toLowerCase();
  return entries.filter((entry) => {
    if (tag && !entry.tags.some((t) => t.toLowerCase() === tag)) return false;
    if (method && entry.method.toLowerCase() !== method) return false;
    if (terms.length === 0) return true;
    const haystack = [
      entry.path,
      entry.summary,
      entry.operationId ?? "",
      ...entry.tags,
      ...entry.scopes,
    ]
      .join(" ")
      .toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function listTags(entries: EndpointEntry[]): string[] {
  return [...new Set(entries.flatMap((e) => e.tags))].sort();
}

function collectRefs(node: unknown, into: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectRefs(item, into);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (key === "$ref" && typeof value === "string") {
        const match = /^#\/components\/schemas\/(.+)$/.exec(value);
        if (match?.[1]) into.add(match[1]);
      } else {
        collectRefs(value, into);
      }
    }
  }
}

/** The OpenAPI document cut down to one tag: only that tag's paths (and only the operations tagged
 *  with it), plus the component schemas those operations reference, transitively. Null when no
 *  operation carries the tag. Still a valid, self-contained OpenAPI document. */
export function buildSpecFragment(spec: SpecDocument, tag: string): SpecDocument | null {
  const wanted = tag.toLowerCase();
  const paths: NonNullable<SpecDocument["paths"]> = {};
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    if (!item) continue;
    const kept: Partial<Record<HttpMethod, SpecOperation>> = {};
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (op?.tags?.some((t) => t.toLowerCase() === wanted)) kept[method] = op;
    }
    if (Object.keys(kept).length > 0) paths[path] = kept;
  }
  if (Object.keys(paths).length === 0) return null;

  const allSchemas = spec.components?.schemas ?? {};
  const needed = new Set<string>();
  collectRefs(paths, needed);
  // Schemas can reference other schemas — walk until no new names turn up.
  const queue = [...needed];
  while (queue.length > 0) {
    const name = queue.pop()!;
    const before = new Set(needed);
    collectRefs(allSchemas[name], needed);
    for (const added of needed) if (!before.has(added)) queue.push(added);
  }
  const schemas = Object.fromEntries(
    [...needed].filter((name) => name in allSchemas).map((name) => [name, allSchemas[name]]),
  );

  return {
    ...spec,
    paths,
    components: {
      ...(spec.components?.securitySchemes
        ? { securitySchemes: spec.components.securitySchemes }
        : {}),
      schemas,
    },
  };
}
