export type { GenerateBunOptions } from "./bun.ts";
export { generateBun } from "./bun.ts";
export type { Config } from "./cli.ts";
export { runCli } from "./cli.ts";
export type { GenerateOptions } from "./generator.ts";
export { generate } from "./generator.ts";
export type {
  FormRequest,
  HtmlRequest,
  HtmlResponse,
  Input,
  JsonRequest,
  JsonResponse,
  MultipartRequest,
  TextRequest,
  TextResponse,
  TypedRequest,
  TypedResponse,
  XmlRequest,
  XmlResponse,
} from "./http.ts";
export type { HttpMethod } from "./internal/discover.ts";
// Runtime helpers — used by the generated routes.ts (`import { … } from "@flying-dice/bunny"`).
export {
  AssertionError,
  applyValidation,
  FORMATS,
  RequestValidationError,
  safeInvoke,
} from "./runtime.ts";
