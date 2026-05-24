# Iteration — `for`, `while`, `break`, `continue`

neoc owns its loop syntax. There is no escape hatch back to raw Lua iteration; every loop in a function body parses as a typed AST node and the codegen emits the Lua equivalent.

## Surface

```neoc
for name in iterable {
  // body
}

while (condition) {
  // body
}

break
continue
```

`for` mirrors Rust: no parens around the binding, mandatory braces around the body. The `iterable` is any expression — typically a range, an array literal, or a value of an array-shaped type.

`while` matches the existing `if (cond)` form (parens around the condition, braces around the body) for visual consistency. The trailing body is any statement, not just a `statement_block` — a single-line body is acceptable.

`break` and `continue` are statements and may appear anywhere inside the closest enclosing loop body. They do not carry labels (Rust's labelled `'outer: loop { … break 'outer; }` is a future extension).

## Lowering

Loops compile straight to the most natural Lua form, chosen by the iterable's shape.

### Numeric `for` over a range

```neoc
for i in 0..5 { body(i) }
```

→

```lua
for i = 0, 5 - 1 do body(i) end
```

The exclusive `..` subtracts one from the upper bound; the inclusive `..=` keeps it intact. No intermediate table is materialised — the loop variable is a scalar `number`.

### Sequence `for` over a non-range

Any iterable that isn't a literal `range_expression` falls back to `ipairs`:

```neoc
for x in [10, 20, 30] { sum = sum + x }
```

→

```lua
for _, x in ipairs({ 10, 20, 30 }) do sum = sum + x end
```

The index slot is `_` because the user only asked for the value. A future extension may surface `for (i, x) in …` for an index-aware iteration.

### `while`

```neoc
while (n < 5) { n = n + 1 }
```

→

```lua
while n < 5 do n = n + 1 end
```

### `break`

`break` lowers 1:1 to Lua's `break` keyword. No label is emitted.

### `continue`

Lua 5.1 has no `continue` keyword or `goto`/labels. The portable idiom is to wrap the body in `repeat … until true` and `break` out of the inner repeat — that aborts the current iteration and the outer loop's iterator advances. The wrapping is only added when the body actually contains a `continue`, so simple loops stay clean.

When the same body also contains a real `break`, the emitter promotes `break` to a two-stage `__break = true; break` (the inner repeat is escaped, then a follow-up check after the repeat fires `break` on the outer loop). A `do … end` block scopes the `__break` flag so nested loops don't collide.

```neoc
for i in 1..=10 {
  if (i == 3) { continue }
  if (i > 7) { break }
  total = total + i
}
```

→

```lua
do
  local __break = false
  for i = 1, 10 do
    repeat
      if i == 3 then
        break
      end
      if i > 7 then
        __break = true; break
      end
      total = total + i
    until true
    if __break then break end
  end
end
```

Runs unmodified on stock Lua 5.1 through 5.5, LuaJIT, and Luau — no `goto` required.

## Inference

`for name in iterable` opens a fresh scope, binds `name`, and runs the body. The loop variable's type follows the iterable:

| Iterable                                 | Inferred element type           |
| ---------------------------------------- | ------------------------------- |
| `range_expression` (`0..5`, `a..=b`)     | `number`                        |
| `array_literal` (`[10, 20, 30]`)         | The first element's inferred type |
| Anything else                            | `unknown`                       |

A future amendment will read the element type off a `Vec<T>` / `Sequence<T>` generic application so user-defined typed sequences expose the right element type to the loop body. Today the inference engine has no nominal sequence type, so the fallback is `unknown`.

## Tests

`examples/features/20-loops.neoc` covers every shape (numeric for / inclusive for / array for / break / continue / while). The transpile-shape contract is pinned by `examples/features/20-loops.test.ts` (Bun snapshot). Runtime semantics are pinned by the `20-loops:` block in `examples/features/run-tests.lua`, which exercises each lowering through real Lua.
