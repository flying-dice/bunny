--- `#[derive(Equals)]` adds `Foo.equals(a, b)` which returns structural
--- equality across every declared field.
local Coord = {}
Coord.__index = Coord
function Coord.new(data)
  data._struct = "Coord"
  setmetatable(data, Coord)
  return data
end

function Coord.equals(a, b)
  if a == b then return true end
  if type(a) ~= "table" or type(b) ~= "table" then return false end
  return a.lat == b.lat and a.lng == b.lng
end

