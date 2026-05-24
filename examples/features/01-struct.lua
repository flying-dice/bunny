--- A 2D point. The basic `struct` declaration: named fields with
--- declared types, an auto-generated `.new(data)` factory, and an
--- auto-injected `_struct` brand for runtime identity.
local Point = {}
Point.__index = Point
function Point.new(data)
  data._struct = "Point"
  setmetatable(data, Point)
  return data
end

