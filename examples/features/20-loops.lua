--- `for name in iterable { ... }`, `while (cond) { ... }`, `break`, and
--- `continue` — the iteration constructs neoc owns natively.
---
--- `for x in 0..n` and `for x in 0..=n` lower to Lua's numeric `for`
--- directly, so the loop variable is a scalar number with no
--- intermediate sequence built. `for x in <array>` walks the array
--- via `ipairs` and exposes the value (not the index).
---
--- `continue` synthesises a `::continue::` label at the bottom of the
--- loop body — Lua has no `continue` keyword, only `goto`.

function sumRange()
  local total = 0
  for i = 0, 5 - 1 do
    total = total + i
  end
  return total
end


function sumInclusive()
  local total = 0
  for i = 1, 4 do
    total = total + i
  end
  return total
end


function sumArray()
  local total = 0
  for _, x in ipairs({ 10, 20, 30 }) do
    total = total + x
  end
  return total
end


function firstOverFive()
  for i = 0, 100 - 1 do
    if i > 5 then
      return i
    end
  end
  return 0
end


function skipThreeStopSeven()
  local total = 0
  for i = 1, 10 do
    if i == 3 then
      goto continue
    end
    if i > 7 then
      break
    end
    total = total + i
    ::continue::
  end
  return total
end


function countDown()
  local n = 5
  while n > 0 do
    n = n - 1
  end
  return n
end

