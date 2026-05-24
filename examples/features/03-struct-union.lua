--- A struct union models a sum type as a TS-style union of struct
--- identities. Each variant carries its own structured payload; the
--- `_struct` brand discriminates at runtime.
---
--- The `type Foo = A | B | C` alias is a TS-level type-system
--- construct — it emits nothing in Lua. Runtime discrimination
--- relies on the per-variant `_struct` brand below.
local Cat = {}
Cat.__index = Cat
function Cat.new(data)
  data._struct = "Cat"
  setmetatable(data, Cat)
  return data
end

local Dog = {}
Dog.__index = Dog
function Dog.new(data)
  data._struct = "Dog"
  setmetatable(data, Dog)
  return data
end

local Fish = {}
Fish.__index = Fish
function Fish.new(data)
  data._struct = "Fish"
  setmetatable(data, Fish)
  return data
end



