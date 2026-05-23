// Two #[command] handlers, both Result-driven.
//
//   calc <a> <op> <b>     parse-then-compute pipeline; CalcError as a
//                         discriminated union, matched on error kind
//   register <email> <name>  Registration.tryNew with deep-validation
//                         chain; pattern-matches on the Result
//
// The pipeline + dispatch uses match expressions wherever the branching
// is structural — Result ok/err, error variants, op selection. No
// try/catch; every failure mode is a typed value.

import { CalcError } from "../errors/CalcError.ts";
import { Registration } from "../dtos/Registration.ts";

// ---------- parsing helpers -----------------------------------------------

function parseNumber(s: string): Result<number, CalcError> {
  const n = Number(s);
  if (Number.isNaN(n)) return Err(CalcError.BadNumber({ input: s }));
  return Ok(n);
}

function apply(a: number, op: string, b: number): Result<number, CalcError> {
  return ((__m) => {
  if (__m === "+") return Ok(a + b);
  if (__m === "-") return Ok(a - b);
  if (__m === "*") return Ok(a * b);
  if (__m === "/") return b === 0 ? Err(CalcError.DivByZero) : Ok(a / b);
  return Err(CalcError.UnknownOp({ op }));
  throw new Error("match: no arm matched");
})(op);
}

// Compose: parse both operands, then apply. Each step short-circuits
// on Err — no try/catch, no thrown exceptions crossing function
// boundaries.
function compute(a: string, op: string, b: string): Result<number, CalcError> {
  const aN = parseNumber(a);
  if (!aN.ok) return aN;
  const bN = parseNumber(b);
  if (!bN.ok) return bN;
  return apply(aN.value, op, bN.value);
}

// Match on an enum variant — `EnumName.Variant { field }` desugars to
// the underlying tagged-union check + field bindings, but reads like
// `match err { CalcError::Variant { field } => ... }` does in Rust.
function describe(err: CalcError): string {
  return ((__m) => {
  if (typeof __m === "object" && __m !== null && (__m as Record<string, unknown>).kind === "BadNumber") { const input = (__m as any).input; return `not a number: ${input}`; }
  if (typeof __m === "object" && __m !== null && (__m as Record<string, unknown>).kind === "UnknownOp") { const op = (__m as any).op; return `unknown operator: ${op}; supported: + - * /`; }
  if (typeof __m === "object" && __m !== null && (__m as Record<string, unknown>).kind === "DivByZero") return "cannot divide by zero";
  throw new Error("match: no arm matched");
})(err);
}

// `match` arms in tsb are single expressions; multi-statement bodies
// don't fit (yet). When the failure path needs both a log and an exit,
// pack them into a `never`-returning helper and call it from the arm.
function failWith(message: string): never {
  console.error(message);
  process.exit(1);
}

// ---------- commands ------------------------------------------------------

export function calcCommand(a: string, op: string, b: string): void {
  // Binding `value: v` / `error: e` pulls the Result payload into the
  // arm body — far cleaner than referring back to `result.value` /
  // `result.error` outside the match (which TS can't narrow through
  // the match IIFE).
  ((__m) => {
  if (typeof __m === "object" && __m !== null && (__m as Record<string, unknown>).ok === true) { const v = (__m as any).value; return console.log(`= ${v}`); }
  if (typeof __m === "object" && __m !== null && (__m as Record<string, unknown>).ok === false) { const e = (__m as any).error; return failWith(describe(e)); }
  return undefined;
  throw new Error("match: no arm matched");
})(compute(a, op, b));
}

export function registerCommand(emailRaw: string, usernameRaw: string): void {
  ((__m) => {
  if (typeof __m === "object" && __m !== null && (__m as Record<string, unknown>).ok === true) { const reg = (__m as any).value; return console.log(
      `registered: ${reg.username.value} <${reg.email.value}>`
    ); }
  if (typeof __m === "object" && __m !== null && (__m as Record<string, unknown>).ok === false) { const e = (__m as any).error; return failWith(`invalid input — ${e.field}: ${e.message}`); }
  return undefined;
  throw new Error("match: no arm matched");
})(Registration.tryNew({
    email: { value: emailRaw },
    username: { value: usernameRaw },
  }));
}

// ---------- combinator demo ----------------------------------------------

export function doubleCommand(n: string): void {
  ((__m) => {
  if (typeof __m === "object" && __m !== null && (__m as Record<string, unknown>).ok === true) { const doubled = (__m as any).value; return console.log(doubled); }
  if (typeof __m === "object" && __m !== null && (__m as Record<string, unknown>).ok === false) { const e = (__m as any).error; return failWith(describe(e)); }
  return undefined;
  throw new Error("match: no arm matched");
})(mapResult(parseNumber(n), (x) => x * 2));
}

export const commands = {
  "calc": { ...{"description":"Evaluate <a> <op> <b>","params":[{"name":"a","type":"string"},{"name":"op","type":"string"},{"name":"b","type":"string"}]}, handler: calcCommand as (...args: any[]) => any },
  "register": { ...{"description":"Validate <email> <username> and print the parsed record","params":[{"name":"emailRaw","type":"string"},{"name":"usernameRaw","type":"string"}]}, handler: registerCommand as (...args: any[]) => any },
  "double": { ...{"description":"Parse <n> then double it. Demonstrates mapResult.","params":[{"name":"n","type":"string"}]}, handler: doubleCommand as (...args: any[]) => any },
};
//# sourceMappingURL=CalcCommands.ts.map
