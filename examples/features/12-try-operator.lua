-- neoc Result prelude
local function Ok(value) return { ok = true, value = value } end
local function Err(error) return { ok = false, error = error } end

--- The `?` postfix operator propagates the `Err` variant of a `Result`
--- out of the enclosing function. `let v = parseInt(s)?` lowers to
--- `local __r = parseInt(s); if not __r.ok then return __r end;
--- local v = __r.value` — short-circuits on Err, unwraps on Ok.
local ParseError = {}
ParseError.__index = ParseError
function ParseError.new(data)
  data._struct = "ParseError"
  setmetatable(data, ParseError)
  return data
end


function parseInt(s)
  local n = tonumber(s)
    if n == nil then return Err(ParseError.new({ input = s })) end
    return Ok(n)
end


--- Use `?` to short-circuit on parse failure. Note: the current
--- statement-level lowering does not yet thread additional statements
--- after the `?`-binding; callers tend to return the bound value
--- directly or use it inline.
function unwrappedTwice(s)
  local __r = parseInt(s)
  if not __r.ok then return __r end
  local v = __r.value;
end

