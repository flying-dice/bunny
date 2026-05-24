--- A `{ stmt; …; final-expr }` block at expression position yields the
--- value of its final expression. Lowers to a Lua IIFE so it gets a
--- fresh scope and works inside any expression position.
---
--- Note: block-expression lowering today only handles the trivial
--- "side-effect statement then final expression" form. Mixing
--- `local`-bindings inside the block is a known limitation.
function squared()
  local result = (function() print("evaluating the block") return 7 * 7 end)()
    return result
end

