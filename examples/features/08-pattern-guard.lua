--- `match` arms accept an `if <expr>` guard between the pattern and
--- the `=>`. The arm matches only when the pattern matches AND the
--- guard evaluates to true; otherwise the next arm is tried.
local Number = {}
Number.__index = Number
function Number.new(data)
  data._struct = "Number"
  setmetatable(data, Number)
  return data
end


function classify(x)
  return (function(__m)
    if type(__m) == "table" and __m._struct == "Number" then local n = __m.n; if n > 0 then return "positive" end end
    if type(__m) == "table" and __m._struct == "Number" then local n = __m.n; if n < 0 then return "negative" end end
    if type(__m) == "table" and __m._struct == "Number" then local n = __m.n; return "zero" end
    error("match: no arm matched")
  end)(x)
end

