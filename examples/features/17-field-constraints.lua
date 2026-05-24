--- Field-constraint macros weave runtime guards into the struct's
--- `.new(data)` factory. A `.new` call with bad data raises a clear
--- Lua error naming the field and the failing constraint.
local User = {}
User.__index = User
function User.new(data)
  if #data.name < 1 then error("User.name: minLength 1") end
  if #data.name > 64 then error("User.name: maxLength 64") end
  if data.age < 0 then error("User.age: minimum 0") end
  if data.age > 150 then error("User.age: maximum 150") end
  data._struct = "User"
  setmetatable(data, User)
  return data
end

