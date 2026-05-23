// Each error variant is its own struct. A plain TS union ties them
// together as "any of these". No `kind` literal anywhere — every
// struct carries its name as a hidden `_struct` brand that tsb adds
// inside `Foo.new(...)` and `Foo.tryNew(...)`. Match dispatches on
// that brand by struct name, never by hand-written discriminator.

export type BadNumber = {
  readonly _struct?: "BadNumber";
  input: string;
};
export const BadNumber = {
  new(data: Omit<BadNumber, "_struct">): BadNumber { return { ...data, _struct: "BadNumber" }; },
};

export type UnknownOp = {
  readonly _struct?: "UnknownOp";
  op: string;
};
export const UnknownOp = {
  new(data: Omit<UnknownOp, "_struct">): UnknownOp { return { ...data, _struct: "UnknownOp" }; },
};

export type DivByZero = {
  readonly _struct?: "DivByZero";
};
export const DivByZero = {
  new(data: Omit<DivByZero, "_struct">): DivByZero { return { ...data, _struct: "DivByZero" }; },
};

export type CalcError = BadNumber | UnknownOp | DivByZero;
//# sourceMappingURL=CalcError.ts.map
