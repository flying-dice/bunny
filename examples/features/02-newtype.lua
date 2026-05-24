--- Tuple-struct shorthand. `struct Foo(T)` desugars to a one-field
--- struct with a synthetic `value: T` field. Useful for branding
--- primitive types so they aren't interchangeable.
local ProductId = {}
ProductId.__index = ProductId
function ProductId.new(data)
  data._struct = "ProductId"
  setmetatable(data, ProductId)
  return data
end


local Money = {}
Money.__index = Money
function Money.new(data)
  data._struct = "Money"
  setmetatable(data, Money)
  return data
end

