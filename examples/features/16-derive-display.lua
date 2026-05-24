--- `#[derive(Display)]` adds `Foo.display(self)` which returns a
--- human-readable `Foo { field=value, … }` string for every declared
--- field. Useful for logging and `print(Foo.display(value))`.
local Vec3 = {}
Vec3.__index = Vec3
function Vec3.new(data)
  data._struct = "Vec3"
  setmetatable(data, Vec3)
  return data
end

function Vec3.display(self)
  return "Vec3 { x=" .. tostring(self.x) .. ", y=" .. tostring(self.y) .. ", z=" .. tostring(self.z) .. " }"
end

