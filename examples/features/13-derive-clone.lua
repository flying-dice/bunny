--- `#[derive(Clone)]` adds `Foo.clone(self)` which returns a deep
--- copy of the struct, preserving the `_struct` brand and metatable.
local Point = {}
Point.__index = Point
function Point.new(data)
  data._struct = "Point"
  setmetatable(data, Point)
  return data
end

function Point.clone(self)
  local copy = {}
  for k, v in pairs(self) do copy[k] = v end
  setmetatable(copy, Point)
  return copy
end

