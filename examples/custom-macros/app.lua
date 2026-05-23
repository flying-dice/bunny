--- A registered user. Demonstrates two user-authored macros:
---   - `#[email]` validates the address inside `.new`.
---   - `#[derive(JsonString)]` emits `User.toJsonString(self)`.
local User = {}
User.__index = User
function User.new(data)
  if #data.name < 1 then error("User.name: minLength 1") end
  if type(data.email) ~= "string" or not string.match(data.email, "^[%w._%%+-]+@[%w.-]+%.[%a]+$") then error("User.email: expected a valid email address") end
  data._struct = "User"
  setmetatable(data, User)
  return data
end

function User.toJsonString(self)
  local function encode(v)
    local t = type(v)
    if t == "string" then
      local escaped = v:gsub("\\", "\\\\"):gsub('"', '\\"')
      return '"' .. escaped .. '"'
    elseif t == "number" or t == "boolean" then
      return tostring(v)
    elseif v == nil then
      return "null"
    else
      error("JsonString: unsupported field type " .. t)
    end
  end
  return table.concat({
    '{',
    '"name":' .. encode(self.name),
    ',"email":' .. encode(self.email),
    ',"active":' .. encode(self.active),
    '}',
  })
end

