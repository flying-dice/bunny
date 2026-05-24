-- neoc Result prelude
local function Ok(value) return { ok = true, value = value } end
local function Err(error) return { ok = false, error = error } end

--- The `?` postfix operator propagates the `Err` variant of a `Result`
--- out of the enclosing function. `let v = expr?` lowers to
--- `local __r = expr; if not __r.ok then return __r end;
--- local v = __r.value` — short-circuits on `Err`, unwraps on `Ok`.
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


function addTwo(a, b)
  local __r = parseInt(a)
  if not __r.ok then return __r end
  local x = __r.value;
    local __r_1 = parseInt(b)
  if not __r_1.ok then return __r_1 end
  local y = __r_1.value;
    return Ok(x + y)
end

