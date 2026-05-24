--- Inherent `impl` block. Methods land on the struct's Lua table
--- and dispatch as `Foo.method(self, …)`.
local Counter = {}
Counter.__index = Counter
function Counter.new(data)
  data._struct = "Counter"
  setmetatable(data, Counter)
  return data
end

function Counter.increment(self)
  self.n = self.n + 1
end
function Counter.value(self)
  return self.n
end



