/**
 * String-format predicates. The asserter emits calls into this table for
 * `@format <name>` constraints. Extend at runtime to add custom formats:
 *
 *     import { FORMATS } from "@flying-dice/bunny";
 *     FORMATS["slug"] = (s) => /^[a-z0-9-]+$/.test(s);
 */
export const FORMATS: Record<string, (s: string) => boolean> = {
  uuid: (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
  email: (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s),
  "date-time": (s) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(s),
  date: (s) => /^\d{4}-\d{2}-\d{2}$/.test(s),
  time: (s) => /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(s),
  duration: (s) => /^P(?!$)(\d+Y)?(\d+M)?(\d+D)?(T(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/.test(s),
  uri: (s) => {
    try {
      new URL(s);
      return true;
    } catch {
      return false;
    }
  },
  url: (s) => {
    try {
      new URL(s);
      return true;
    } catch {
      return false;
    }
  },
  ipv4: (s) =>
    /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(s),
  ipv6: (s) => /^([0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i.test(s),
  hostname: (s) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(s),
  byte: (s) => /^[A-Za-z0-9+/]*={0,2}$/.test(s) && s.length % 4 === 0,
};

/**
 * Thrown by generated validator functions when a value fails its schema.
 * Carries a JSON-path-ish location *within* the validated value (`""` is
 * the root, `.id` is the `id` property, `[3].name` is the 4th item's name).
 *
 * Generated code throws this; the runtime wraps it in
 * `RequestValidationError` once it knows whether the failing value was
 * `params`, `query`, or `body`.
 */
export class AssertionError extends Error {
  constructor(
    public readonly path: string,
    public readonly reason: string
  ) {
    super(`${path || "(root)"}: ${reason}`);
    this.name = "AssertionError";
  }
}

/**
 * Thrown when an incoming request value fails validation. Always converts
 * to a `400 BadRequest` by `safeInvoke`. Carries the request location
 * (`params` / `query` / `body`), a `reason`, and the JSON-path-ish `path`
 * pointing at the failing field.
 */
export class RequestValidationError extends Error {
  constructor(
    public readonly location: "params" | "query" | "body",
    public readonly reason: string,
    public readonly path: string
  ) {
    super(`request ${location}${path || ""}: ${reason}`);
    this.name = "RequestValidationError";
  }
}

type Validator = (v: unknown) => void;

/**
 * Validate `params`, `query`, and JSON `body` against generated validator
 * functions. Body validation is **eager**: when `validators.body` is set,
 * `applyValidation` parses the body once, validates it, and replaces
 * `req.json()` with a cached resolver so the handler still reads it
 * naturally. Failures throw `RequestValidationError`; `safeInvoke` catches
 * them and renders a 400.
 */
export async function applyValidation(
  req: { params: unknown; query: unknown; json: () => Promise<unknown> },
  validators: {
    params?: Validator;
    query?: Validator;
    body?: Validator;
  }
): Promise<void> {
  if (validators.params) runOrWrap("params", validators.params, req.params);
  if (validators.query) runOrWrap("query", validators.query, req.query);
  if (validators.body) {
    let parsed: unknown;
    try {
      parsed = await req.json();
    } catch {
      throw new RequestValidationError("body", "invalid JSON", "");
    }
    runOrWrap("body", validators.body, parsed);
    // Cache the parsed body so the handler's `await req.json()` returns
    // it without re-reading the (now-consumed) request stream.
    req.json = async () => parsed;
  }
}

function runOrWrap(location: "params" | "query" | "body", fn: Validator, value: unknown): void {
  try {
    fn(value);
  } catch (err) {
    if (err instanceof AssertionError) {
      throw new RequestValidationError(location, err.reason, err.path);
    }
    throw err;
  }
}

/**
 * Run a handler safely:
 *
 *   RequestValidationError → 400 with `source: "request"`
 *   anything else thrown   → 500 with `source: "response"`
 *
 * Both bodies include a `reason`. Request errors additionally include the
 * `location` (params/query/body) and the `path` pointing at the failing
 * field.
 */
export async function safeInvoke(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof RequestValidationError) {
      return Response.json(
        {
          error: "BadRequest",
          source: "request",
          location: err.location,
          path: err.path,
          reason: err.reason,
        },
        { status: 400 }
      );
    }
    const reason = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : "Error";
    return Response.json(
      {
        error: "InternalServerError",
        source: "response",
        reason,
        name,
      },
      { status: 500 }
    );
  }
}
