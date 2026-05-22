/**
 * Shape passed to `TypedRequest`'s generic. Whatever you declare here gets
 * surfaced as typed fields on the request *and* as OpenAPI parameters /
 * request body in the generated spec.
 */
export interface Input {
  params?: Record<string, string>;
  body?: unknown;
  query?: Record<string, unknown>;
}

/**
 * Web-standard `Request` augmented with typed `params` and `query`, plus a
 * `json()` whose return type is the declared body. The runtime value *is* a
 * real Fetch `Request` — the adapter shim attaches `params` and `query` as
 * own-properties before the handler runs. No validation, no enforcement.
 *
 * The second generic `C` is purely a codegen marker: it declares the
 * request body's media type (defaults to `application/json`). It is not
 * referenced at runtime; the handler reads the body via standard Fetch
 * methods (`req.json()`, `req.text()`, `req.formData()`, ...).
 */
export interface TypedRequest<
  I extends Input = {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _C extends string = "application/json",
> extends globalThis.Request {
  readonly params: I extends { params: infer P } ? P : {};
  readonly query: I extends { query: infer Q } ? Q : {};
  json(): Promise<I extends { body: infer B } ? B : unknown>;
}

/**
 * Web-standard `Response` carrying phantom body, status, and content-type
 * brands. Any real `Response` is structurally assignable (the brands are
 * optional). The codegen recovers all three via `__body` / `__status` /
 * `__contentType`.
 *
 * Union types let you declare multiple statuses or content types:
 *
 *     // Two statuses
 *     TypedResponse<User> | TypedResponse<{ message: string }, 404>
 *
 *     // Same status, two content types (merged into one response object)
 *     TypedResponse<User> | TypedResponse<User, 200, "application/xml">
 */
export type TypedResponse<
  T = void,
  S extends number = 200,
  C extends string = "application/json",
> = globalThis.Response & {
  readonly __body?: T;
  readonly __status?: S;
  readonly __contentType?: C;
};

// ---------------------------------------------------------------------------
// Response aliases
// ---------------------------------------------------------------------------

/** `application/json` response with body `T`. Explicit alias for the default. */
export type JsonResponse<T = unknown, S extends number = 200> = TypedResponse<
  T,
  S,
  "application/json"
>;

/** `text/plain` response carrying a string body. */
export type TextResponse<S extends number = 200> = TypedResponse<string, S, "text/plain">;

/** `text/html` response carrying a string body. */
export type HtmlResponse<S extends number = 200> = TypedResponse<string, S, "text/html">;

/** `application/xml` response. `T` describes the document's logical shape. */
export type XmlResponse<T = string, S extends number = 200> = TypedResponse<
  T,
  S,
  "application/xml"
>;

// ---------------------------------------------------------------------------
// Request aliases
// ---------------------------------------------------------------------------

/** `application/json` request. Explicit alias for the default. */
export type JsonRequest<I extends Input = {}> = TypedRequest<I, "application/json">;

/** `application/xml` request — read the payload via `await req.text()`. */
export type XmlRequest<I extends Input = {}> = TypedRequest<I, "application/xml">;

/** `text/plain` request — read the payload via `await req.text()`. */
export type TextRequest<I extends Input = {}> = TypedRequest<I, "text/plain">;

/** `text/html` request — read the payload via `await req.text()`. */
export type HtmlRequest<I extends Input = {}> = TypedRequest<I, "text/html">;

/**
 * `application/x-www-form-urlencoded` request — read the payload via
 * `await req.formData()` or `new URLSearchParams(await req.text())`.
 */
export type FormRequest<I extends Input = {}> = TypedRequest<
  I,
  "application/x-www-form-urlencoded"
>;

/** `multipart/form-data` request — read via `await req.formData()`. */
export type MultipartRequest<I extends Input = {}> = TypedRequest<I, "multipart/form-data">;
