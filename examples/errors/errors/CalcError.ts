// A Rust-style enum: tagged union with namespaced constructors. tsb
// emits a TS discriminated union and a `CalcError` namespace const
// holding the variant factories (`CalcError.BadNumber({ input })`,
// `CalcError.DivByZero` for unit variants).
//
// Matching uses the `CalcError.Variant` syntax — far closer to
// Rust's `CalcError::Variant` than the raw `{ kind: "X" }` form.

export type CalcError =
  | { kind: "BadNumber"; input: string }
  | { kind: "UnknownOp"; op: string }
  | { kind: "DivByZero" };

export const CalcError = {
  BadNumber(fields: { input: string }): CalcError { return { kind: "BadNumber", ...fields }; },
  UnknownOp(fields: { op: string }): CalcError { return { kind: "UnknownOp", ...fields }; },
  DivByZero: { kind: "DivByZero" } as CalcError,
};
//# sourceMappingURL=CalcError.ts.map
