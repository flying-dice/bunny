--- Range expressions build a sequence of integers.
--- `a..b` is exclusive on the right; `a..=b` is inclusive.
--- Lowers to a Lua sequence-building IIFE.
export function exclusive(): table {
  return 0..5
}

export function inclusive(): table {
  return 0..=5
}

export function withBounds(lo: number, hi: number): table {
  return lo..hi
}
