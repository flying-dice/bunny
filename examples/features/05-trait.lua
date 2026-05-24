--- Traits declare required methods and optional default-bodied ones.
--- `impl Trait for Struct` provides the implementations; defaults are
--- inherited unless the impl overrides them.


local Person = {}
Person.__index = Person
function Person.new(data)
  data._struct = "Person"
  setmetatable(data, Person)
  return data
end

function Person.greeting(self)
  return "Hello, " .. self.name
end
function Person.shout(self)
  return Person.greeting(self) .. "!"
end



