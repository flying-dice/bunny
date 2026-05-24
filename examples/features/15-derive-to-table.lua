--- `#[derive(ToTable)]` adds `Foo.toTable(self)` which returns a plain
--- Lua table (no metatable, no methods) — useful for JSON encoding,
--- network serialisation, or testing.
local User = {}
User.__index = User
function User.new(data)
  data._struct = "User"
  setmetatable(data, User)
  return data
end

function User.toTable(self)
  return {
    id = self.id,
    name = self.name,
    age = self.age,
  }
end

