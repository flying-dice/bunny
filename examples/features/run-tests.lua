-- Runtime + shape tests for every generated `.lua` in this directory.
--
-- Usage:
--   cd examples/features
--   luau run-tests.lua
--
-- Each test either:
--   1. exercises the compiled feature at runtime by loading the .lua
--      chunk *into the test scope* (so locals declared inside the
--      generated module are visible to the assertions that follow), or
--   2. snapshots the SHAPE of the generated code by reading the .lua
--      text and asserting that specific anchor lines are still
--      produced by the codegen.
--
-- Both kinds of test fail loudly with a path + reason so a regression
-- in either behaviour or codegen shape is obvious from the report.

local results = { passed = 0, failed = 0, failures = {} }

local function test(name, body)
  local ok, err = pcall(body)
  if ok then
    results.passed = results.passed + 1
    print("PASS " .. name)
  else
    results.failed = results.failed + 1
    print("FAIL " .. name .. ": " .. tostring(err))
    results.failures[#results.failures + 1] = { name = name, err = err }
  end
end

-- Read a file into a string.
local function readFile(path)
  local fh = assert(io.open(path, "r"), "cannot open " .. path)
  local body = fh:read("*a")
  fh:close()
  return body
end

-- Load a generated .lua file plus a trailing test block into ONE
-- chunk, so locals declared inside the generated source are visible
-- to the assertions in `tail`.
local function loadWith(path, tail)
  local source = readFile(path) .. "\n" .. tail
  local fn, loadErr = load(source)
  if not fn then error(loadErr) end
  return fn()
end

-- Assert that a substring appears in the file's source text.
local function assertSnippet(path, snippet)
  local source = readFile(path)
  if not source:find(snippet, 1, true) then
    error("expected " .. path .. " to contain `" .. snippet .. "`")
  end
end

-- =========================================================================
-- 01-struct
-- =========================================================================

test("01-struct: factory stamps the brand and metatable", function()
  loadWith("01-struct.lua", [[
    local p = Point.new({ x = 3, y = 4 })
    assert(p.x == 3, "x")
    assert(p.y == 4, "y")
    assert(p._struct == "Point", "brand")
    assert(getmetatable(p) == Point, "metatable")
  ]])
end)

test("01-struct: shape — factory + brand + metatable lines", function()
  assertSnippet("01-struct.lua", "local Point = {}")
  assertSnippet("01-struct.lua", "Point.__index = Point")
  assertSnippet("01-struct.lua", "function Point.new(data)")
  assertSnippet("01-struct.lua", 'data._struct = "Point"')
  assertSnippet("01-struct.lua", "setmetatable(data, Point)")
end)

-- =========================================================================
-- 02-newtype
-- =========================================================================

test("02-newtype: tuple shorthand emits a value-only struct", function()
  loadWith("02-newtype.lua", [[
    local id = ProductId.new({ value = "abc" })
    assert(id.value == "abc", "value")
    assert(id._struct == "ProductId", "brand")
    local m = Money.new({ value = 42 })
    assert(m.value == 42, "money value")
    assert(m._struct == "Money", "money brand")
  ]])
end)

test("02-newtype: shape — both newtype structs emit factories", function()
  assertSnippet("02-newtype.lua", "function ProductId.new(data)")
  assertSnippet("02-newtype.lua", "function Money.new(data)")
end)

-- =========================================================================
-- 03-struct-union
-- =========================================================================

test("03-struct-union: each variant has its own brand", function()
  loadWith("03-struct-union.lua", [[
    local cat = Cat.new({ name = "Mittens" })
    local dog = Dog.new({ name = "Rex" })
    local fish = Fish.new({ name = "Bubbles" })
    assert(cat._struct == "Cat")
    assert(dog._struct == "Dog")
    assert(fish._struct == "Fish")
  ]])
end)

test("03-struct-union: shape — three factories emitted", function()
  assertSnippet("03-struct-union.lua", "function Cat.new(data)")
  assertSnippet("03-struct-union.lua", "function Dog.new(data)")
  assertSnippet("03-struct-union.lua", "function Fish.new(data)")
end)

-- =========================================================================
-- 04-impl
-- =========================================================================

test("04-impl: methods land on the struct table and mutate self", function()
  loadWith("04-impl.lua", [[
    local c = Counter.new({ n = 0 })
    Counter.increment(c)
    Counter.increment(c)
    Counter.increment(c)
    assert(Counter.value(c) == 3, "expected 3 after three increments")
  ]])
end)

test("04-impl: shape — methods attach as `function Counter.<name>(self,…)`", function()
  assertSnippet("04-impl.lua", "function Counter.increment(self)")
  assertSnippet("04-impl.lua", "function Counter.value(self)")
end)

-- =========================================================================
-- 05-trait
-- =========================================================================

test("05-trait: user-supplied method overrides + default inherited", function()
  loadWith("05-trait.lua", [[
    local p = Person.new({ name = "Ada" })
    assert(Person.greeting(p) == "Hello, Ada", "greeting")
    assert(Person.shout(p) == "Hello, Ada!", "shout default")
  ]])
end)

test("05-trait: shape — both methods land on Person table", function()
  assertSnippet("05-trait.lua", "function Person.greeting(self)")
  assertSnippet("05-trait.lua", "function Person.shout(self)")
  -- `Self` in the default body must have been substituted with Person.
  assertSnippet("05-trait.lua", "Person.greeting(self)")
end)

-- =========================================================================
-- 06-self-type
-- =========================================================================

test("06-self-type: Self in impl signature lowers to the target struct", function()
  loadWith("06-self-type.lua", [[
    local b = Box.new({ count = 5 })
    local doubled = Box.double(b)
    assert(doubled.count == 10, "double count")
    assert(doubled._struct == "Box", "brand preserved")
  ]])
end)

test("06-self-type: shape — method signature drops type annotations", function()
  assertSnippet("06-self-type.lua", "function Box.double(self)")
end)

-- =========================================================================
-- 07-match
-- =========================================================================

test("07-match: struct pattern + literal pattern + binding pattern", function()
  loadWith("07-match.lua", [[
    assert(sound(Cat.new({})) == "meow")
    assert(sound(Dog.new({})) == "woof")
    assert(sound({}) == "unknown")  -- wildcard
    assert(describe(0) == "zero")
    assert(describe(1) == "one")
    local got = describe(42)
    assert(got == "many: 42", "binding pattern: " .. got)
  ]])
end)

test("07-match: shape — lowers to a Lua IIFE with struct-brand checks", function()
  assertSnippet("07-match.lua", "(function(__m)")
  assertSnippet("07-match.lua", '__m._struct == "Cat"')
  assertSnippet("07-match.lua", '__m._struct == "Dog"')
end)

-- =========================================================================
-- 08-pattern-guard
-- =========================================================================

test("08-pattern-guard: guards select between same-shape arms", function()
  loadWith("08-pattern-guard.lua", [[
    assert(classify(Number.new({ n = 5 })) == "positive")
    assert(classify(Number.new({ n = -3 })) == "negative")
    assert(classify(Number.new({ n = 0 })) == "zero")
  ]])
end)

test("08-pattern-guard: shape — guard reads as `if <expr>` inside arm", function()
  -- The lowered arm body should contain `if n > 0 then return "positive" end`
  -- inside the struct-pattern conditional.
  assertSnippet("08-pattern-guard.lua", 'if n > 0 then return "positive"')
  assertSnippet("08-pattern-guard.lua", 'if n < 0 then return "negative"')
end)

-- =========================================================================
-- 09-block-expression
-- =========================================================================

test("09-block-expression: block returns its final expression", function()
  loadWith("09-block-expression.lua", [[
    assert(squared() == 49, "7 * 7")
  ]])
end)

test("09-block-expression: shape — wraps body in `(function() … end)()`", function()
  assertSnippet("09-block-expression.lua", "(function()")
  assertSnippet("09-block-expression.lua", "return 7 * 7 end)()")
end)

-- =========================================================================
-- 10-range-expression
-- =========================================================================

test("10-range-expression: exclusive vs inclusive range tables", function()
  loadWith("10-range-expression.lua", [[
    local ex = exclusive()
    assert(#ex == 5, "exclusive 0..5 has 5 elements, got " .. #ex)
    assert(ex[1] == 0 and ex[5] == 4, "exclusive bounds")
    local inc = inclusive()
    assert(#inc == 6, "inclusive 0..=5 has 6 elements, got " .. #inc)
    assert(inc[1] == 0 and inc[6] == 5, "inclusive bounds")
    local b = withBounds(2, 5)
    assert(#b == 3 and b[1] == 2 and b[3] == 4, "withBounds 2..5")
  ]])
end)

test("10-range-expression: shape — sequence-building IIFE", function()
  assertSnippet("10-range-expression.lua", "function exclusive()")
  assertSnippet("10-range-expression.lua", "function inclusive()")
end)

-- =========================================================================
-- 11-result
-- =========================================================================

test("11-result: Ok / Err shapes", function()
  loadWith("11-result.lua", [[
    local good = parsePositive("42")
    assert(good.ok == true, "Ok flag")
    assert(good.value == 42, "Ok value")
    local bad = parsePositive("nope")
    assert(bad.ok == false, "Err flag")
    assert(bad.error._struct == "ParseError", "error variant brand")
    assert(bad.error.input == "nope", "error captures input")
  ]])
end)

test("11-result: shape — auto-prepended prelude", function()
  assertSnippet("11-result.lua", "local function Ok(value) return { ok = true, value = value } end")
  assertSnippet("11-result.lua", "local function Err(error) return { ok = false, error = error } end")
end)

-- =========================================================================
-- 12-try-operator
-- =========================================================================

test("12-try-operator: shape — `?` lowers to a guarded local binding", function()
  assertSnippet("12-try-operator.lua", "local __r = parseInt(s)")
  assertSnippet("12-try-operator.lua", "if not __r.ok then return __r end")
  assertSnippet("12-try-operator.lua", "local v = __r.value;")
end)

-- =========================================================================
-- 13-derive-clone
-- =========================================================================

test("13-derive-clone: clone is a deep copy with metatable preserved", function()
  loadWith("13-derive-clone.lua", [[
    local p = Point.new({ x = 1, y = 2 })
    local q = Point.clone(p)
    assert(q.x == 1 and q.y == 2, "fields copied")
    assert(q._struct == "Point", "brand preserved")
    assert(getmetatable(q) == Point, "metatable preserved")
    q.x = 99
    assert(p.x == 1, "original untouched")
  ]])
end)

test("13-derive-clone: shape — Point.clone function defined", function()
  assertSnippet("13-derive-clone.lua", "function Point.clone(self)")
  assertSnippet("13-derive-clone.lua", "for k, v in pairs(self) do copy[k] = v end")
end)

-- =========================================================================
-- 14-derive-equals
-- =========================================================================

test("14-derive-equals: structural equality across fields", function()
  loadWith("14-derive-equals.lua", [[
    local a = Coord.new({ lat = 51.5, lng = -0.1 })
    local b = Coord.new({ lat = 51.5, lng = -0.1 })
    local c = Coord.new({ lat = 51.5, lng = 0.0 })
    assert(Coord.equals(a, a), "same identity")
    assert(Coord.equals(a, b), "structurally equal")
    assert(not Coord.equals(a, c), "differing field")
  ]])
end)

test("14-derive-equals: shape — equals function emits per-field AND", function()
  assertSnippet("14-derive-equals.lua", "function Coord.equals(a, b)")
  assertSnippet("14-derive-equals.lua", "a.lat == b.lat and a.lng == b.lng")
end)

-- =========================================================================
-- 15-derive-to-table
-- =========================================================================

test("15-derive-to-table: toTable strips the brand + metatable", function()
  loadWith("15-derive-to-table.lua", [[
    local u = User.new({ id = "u1", name = "Ada", age = 36 })
    local t = User.toTable(u)
    assert(t.id == "u1" and t.name == "Ada" and t.age == 36, "fields copied")
    assert(t._struct == nil, "brand stripped")
    assert(getmetatable(t) == nil, "no metatable")
  ]])
end)

test("15-derive-to-table: shape — emits per-field assignment", function()
  assertSnippet("15-derive-to-table.lua", "function User.toTable(self)")
  assertSnippet("15-derive-to-table.lua", "id = self.id,")
end)

-- =========================================================================
-- 16-derive-display
-- =========================================================================

test("16-derive-display: human-readable rendering with every field", function()
  loadWith("16-derive-display.lua", [[
    local v = Vec3.new({ x = 1, y = 2, z = 3 })
    local rendered = Vec3.display(v)
    assert(rendered:find("Vec3 { ", 1, true), "type prefix")
    assert(rendered:find("x=1", 1, true), "x field")
    assert(rendered:find("y=2", 1, true), "y field")
    assert(rendered:find("z=3", 1, true), "z field")
  ]])
end)

test("16-derive-display: shape — display function builds the brand prefix", function()
  assertSnippet("16-derive-display.lua", "function Vec3.display(self)")
  assertSnippet("16-derive-display.lua", '"Vec3 { ')
end)

-- =========================================================================
-- 17-field-constraints
-- =========================================================================

test("17-field-constraints: valid input passes through `.new`", function()
  loadWith("17-field-constraints.lua", [[
    local u = User.new({ name = "Ada", age = 36 })
    assert(u.name == "Ada" and u.age == 36)
  ]])
end)

test("17-field-constraints: violating constraints raise descriptive errors", function()
  loadWith("17-field-constraints.lua", [[
    local ok, err = pcall(User.new, { name = "", age = 36 })
    assert(not ok, "empty name should throw")
    assert(tostring(err):find("minLength", 1, true), "error mentions minLength")
    local ok2, err2 = pcall(User.new, { name = "Ada", age = 999 })
    assert(not ok2, "huge age should throw")
    assert(tostring(err2):find("maximum", 1, true), "error mentions maximum")
  ]])
end)

test("17-field-constraints: shape — every guard appears in `.new`", function()
  assertSnippet("17-field-constraints.lua", "if #data.name < 1 then error")
  assertSnippet("17-field-constraints.lua", "if #data.name > 64 then error")
  assertSnippet("17-field-constraints.lua", "if data.age < 0 then error")
  assertSnippet("17-field-constraints.lua", "if data.age > 150 then error")
end)

-- =========================================================================
-- 18-test-attribute
-- =========================================================================

test("18-test-attribute: shape — each `#[test]` fn registers in __neoc_tests", function()
  assertSnippet("18-test-attribute.lua", "function addition_works()")
  assertSnippet("18-test-attribute.lua", "function string_concat_works()")
  assertSnippet("18-test-attribute.lua", '__neoc_tests[#__neoc_tests + 1] = { name = "addition_works", run = addition_works }')
  assertSnippet("18-test-attribute.lua", '__neoc_tests[#__neoc_tests + 1] = { name = "string_concat_works", run = string_concat_works }')
end)

test("18-test-attribute: behaviour — the registered functions actually pass", function()
  loadWith("18-test-attribute.lua", [[
    for _, t in ipairs(__neoc_tests) do
      local ok, err = pcall(t.run)
      if not ok then error("registered test " .. t.name .. " failed: " .. tostring(err)) end
    end
  ]])
end)

-- =========================================================================
-- 19-doc-comments
-- =========================================================================

test("19-doc-comments: shape — `///` rewritten to `---`", function()
  local source = readFile("19-doc-comments.lua")
  -- No LINE should start with `///` (the codegen translates `///`
  -- doc-comment prefixes to `---`). A literal `///` inside a doc
  -- comment's text is fine — that's just markdown content.
  for line in source:gmatch("[^\n]+") do
    if line:match("^%s*///") then
      error("doc-comment `///` prefix leaked into emitted Lua: " .. line)
    end
  end
  assertSnippet("19-doc-comments.lua", "--- The canonical greeting routine.")
end)

test("19-doc-comments: behaviour — greet returns the expected string", function()
  loadWith("19-doc-comments.lua", [[
    assert(greet("world") == "Hello, world")
  ]])
end)

-- =========================================================================
-- Report
-- =========================================================================

print("")
print(string.format("%d passed, %d failed", results.passed, results.failed))
if results.failed > 0 then
  os.exit(1)
end
