// A TypeScript discriminated union — the canonical way to model "this
// operation can fail in N typed ways". Each branch carries a `kind`
// discriminator plus whatever fields that variant needs. Match
// patterns (in CalcCommands.tsb) bind the fields into arm scope.

export type CalcError =
  | { kind: "BadNumber"; input: string }
  | { kind: "UnknownOp"; op: string }
  | { kind: "DivByZero" };
//# sourceMappingURL=CalcError.ts.map
