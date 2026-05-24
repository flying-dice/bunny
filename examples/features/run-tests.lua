-- Runtime tests for every generated `.lua` in this directory.
--
-- Each test loads the compiled chunk into the test's scope (so locals
-- declared inside the generated file are visible to the assertions
-- that follow) and exercises the feature at runtime.
--
-- The SHAPE of the generated code is asserted separately, via Bun's
-- snapshot framework in the sibling `.test.ts` files. This file owns
-- runnability only.
--
-- Usage:
--   cd examples/features
--   lua run-tests.lua

local results = { passed = 0, failed = 0 }

local function test(name, body)
  local ok, err = pcall(body)
  if ok then
    results.passed = results.passed + 1
    print("PASS " .. name)
  else
    results.failed = results.failed + 1
    print("FAIL " .. name .. ": " .. tostring(err))
  end
end

local function readFile(path)
  local fh = assert(io.open(path, "r"), "cannot open " .. path)
  local body = fh:read("*a")
  fh:close()
  return body
end

-- Load a generated .lua plus a trailing test block as ONE chunk so
-- locals declared inside the generated source remain visible.
local function loadWith(path, tail)
  local source = readFile(path) .. "\n" .. tail
  local fn, loadErr = load(source)
  if not fn then error(loadErr) end
  return fn()
end

-- =========================================================================

test("01-struct: factory stamps the brand and metatable", function()
  loadWith("01-struct.lua", [[
    local p = Point.new({ x = 3, y = 4 })
    assert(p.x == 3 and p.y == 4)
    assert(p._struct == "Point")
    assert(getmetatable(p) == Point)
  ]])
end)

test("02-newtype: tuple shorthand emits a value-only struct", function()
  loadWith("02-newtype.lua", [[
    local id = ProductId.new({ value = "abc" })
    assert(id.value == "abc" and id._struct == "ProductId")
    local m = Money.new({ value = 42 })
    assert(m.value == 42 and m._struct == "Money")
  ]])
end)

test("03-struct-union: each variant has its own brand", function()
  loadWith("03-struct-union.lua", [[
    assert(Cat.new({ name = "Mittens" })._struct == "Cat")
    assert(Dog.new({ name = "Rex" })._struct == "Dog")
    assert(Fish.new({ name = "Bubbles" })._struct == "Fish")
  ]])
end)

test("04-impl: methods land on the struct table and mutate self", function()
  loadWith("04-impl.lua", [[
    local c = Counter.new({ n = 0 })
    Counter.increment(c)
    Counter.increment(c)
    Counter.increment(c)
    assert(Counter.value(c) == 3)
  ]])
end)

test("05-trait: user-supplied method overrides + default inherited", function()
  loadWith("05-trait.lua", [[
    local p = Person.new({ name = "Ada" })
    assert(Person.greeting(p) == "Hello, Ada")
    assert(Person.shout(p) == "Hello, Ada!")
  ]])
end)

test("06-self-type: Self in impl signature lowers to the target struct", function()
  loadWith("06-self-type.lua", [[
    local b = Box.new({ count = 5 })
    local doubled = Box.double(b)
    assert(doubled.count == 10)
    assert(doubled._struct == "Box")
  ]])
end)

test("07-match: struct + literal + binding patterns", function()
  loadWith("07-match.lua", [[
    assert(sound(Cat.new({})) == "meow")
    assert(sound(Dog.new({})) == "woof")
    assert(sound({}) == "unknown")
    assert(describe(0) == "zero")
    assert(describe(1) == "one")
    assert(describe(42) == "many: 42")
  ]])
end)

test("08-pattern-guard: guards select between same-shape arms", function()
  loadWith("08-pattern-guard.lua", [[
    assert(classify(Number.new({ n = 5 })) == "positive")
    assert(classify(Number.new({ n = -3 })) == "negative")
    assert(classify(Number.new({ n = 0 })) == "zero")
  ]])
end)

test("09-block-expression: block returns its final expression", function()
  loadWith("09-block-expression.lua", [[
    assert(squared() == 49)
  ]])
end)

test("10-range-expression: exclusive vs inclusive range tables", function()
  loadWith("10-range-expression.lua", [[
    local ex = exclusive()
    assert(#ex == 5 and ex[1] == 0 and ex[5] == 4)
    local inc = inclusive()
    assert(#inc == 6 and inc[1] == 0 and inc[6] == 5)
    local b = withBounds(2, 5)
    assert(#b == 3 and b[1] == 2 and b[3] == 4)
  ]])
end)

test("11-result: Ok / Err shapes", function()
  loadWith("11-result.lua", [[
    local good = parsePositive("42")
    assert(good.ok == true and good.value == 42)
    local bad = parsePositive("nope")
    assert(bad.ok == false)
    assert(bad.error._struct == "ParseError" and bad.error.input == "nope")
  ]])
end)

test("13-derive-clone: clone is a deep copy with metatable preserved", function()
  loadWith("13-derive-clone.lua", [[
    local p = Point.new({ x = 1, y = 2 })
    local q = Point.clone(p)
    assert(q.x == 1 and q.y == 2 and q._struct == "Point")
    assert(getmetatable(q) == Point)
    q.x = 99
    assert(p.x == 1)
  ]])
end)

test("14-derive-equals: structural equality across fields", function()
  loadWith("14-derive-equals.lua", [[
    local a = Coord.new({ lat = 51.5, lng = -0.1 })
    local b = Coord.new({ lat = 51.5, lng = -0.1 })
    local c = Coord.new({ lat = 51.5, lng = 0.0 })
    assert(Coord.equals(a, a))
    assert(Coord.equals(a, b))
    assert(not Coord.equals(a, c))
  ]])
end)

test("15-derive-to-table: toTable strips brand + metatable", function()
  loadWith("15-derive-to-table.lua", [[
    local u = User.new({ id = "u1", name = "Ada", age = 36 })
    local t = User.toTable(u)
    assert(t.id == "u1" and t.name == "Ada" and t.age == 36)
    assert(t._struct == nil)
    assert(getmetatable(t) == nil)
  ]])
end)

test("16-derive-display: human-readable rendering with every field", function()
  loadWith("16-derive-display.lua", [[
    local v = Vec3.new({ x = 1, y = 2, z = 3 })
    local rendered = Vec3.display(v)
    assert(rendered:find("Vec3 { ", 1, true))
    assert(rendered:find("x=1", 1, true))
    assert(rendered:find("y=2", 1, true))
    assert(rendered:find("z=3", 1, true))
  ]])
end)

test("17-field-constraints: valid input passes through", function()
  loadWith("17-field-constraints.lua", [[
    local u = User.new({ name = "Ada", age = 36 })
    assert(u.name == "Ada" and u.age == 36)
  ]])
end)

test("17-field-constraints: violations raise descriptive errors", function()
  loadWith("17-field-constraints.lua", [[
    local ok, err = pcall(User.new, { name = "", age = 36 })
    assert(not ok and tostring(err):find("minLength", 1, true))
    local ok2, err2 = pcall(User.new, { name = "Ada", age = 999 })
    assert(not ok2 and tostring(err2):find("maximum", 1, true))
  ]])
end)

test("18-test-attribute: every registered test runs and passes", function()
  loadWith("18-test-attribute.lua", [[
    for _, t in ipairs(__neoc_tests) do
      local ok, err = pcall(t.run)
      if not ok then error("registered test " .. t.name .. " failed: " .. tostring(err)) end
    end
  ]])
end)

test("19-doc-comments: greet returns the expected string", function()
  loadWith("19-doc-comments.lua", [[
    assert(greet("world") == "Hello, world")
  ]])
end)

-- =========================================================================

print("")
print(string.format("%d passed, %d failed", results.passed, results.failed))
if results.failed > 0 then
  os.exit(1)
end
