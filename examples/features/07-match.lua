--- `match` is a value-yielding expression with four pattern kinds:
--- wildcard `_`, literal, binding identifier, struct/object pattern.
--- Lowers to a Lua IIFE.

-- Runtime bindings used by this example.


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


function sound(animal)
  return (function(__m)
    if type(__m) == "table" and __m._struct == "Cat" then return "meow" end
    if type(__m) == "table" and __m._struct == "Dog" then return "woof" end
    return "unknown"
  end)(animal)
end


function describe(x)
  return (function(__m)
    if __m == 0 then return "zero" end
    if __m == 1 then return "one" end
    do local n = __m; return "many: " .. tostring(n) end
  end)(x)
end

