-- neoc Result prelude
local function Ok(value) return { ok = true, value = value } end
local function Err(error) return { ok = false, error = error } end

-- Runtime bindings used by this showcase. In a real project these
-- live in a dedicated bindings file the runtime ships with; the
-- showcase declares them inline for readability.


--- A point on a 2D plane.
local Point = {}
Point.__index = Point
function Point.new(data)
  data._struct = "Point"
  setmetatable(data, Point)
  return data
end

function Point.translate(self, dx, dy)
  return Point.new({ x = self.x + dx, y = self.y + dy })
end
function Point.clone(self)
  local copy = {}
  for k, v in pairs(self) do copy[k] = v end
  setmetatable(copy, Point)
  return copy
end
function Point.equals(a, b)
  if a == b then return true end
  if type(a) ~= "table" or type(b) ~= "table" then return false end
  return a.x == b.x and a.y == b.y
end
function Point.toTable(self)
  return {
    x = self.x,
    y = self.y,
  }
end
function Point.display(self)
  return "Point { x=" .. tostring(self.x) .. ", y=" .. tostring(self.y) .. " }"
end




--- A product sold in the shop.
local Product = {}
Product.__index = Product
function Product.new(data)
  if #data.name < 1 then error("Product.name: minLength 1") end
  if #data.name > 200 then error("Product.name: maxLength 200") end
  if data.priceCents < 0 then error("Product.priceCents: minimum 0") end
  if data.stock < 0 then error("Product.stock: minimum 0") end
  data._struct = "Product"
  setmetatable(data, Product)
  return data
end

function Product.priceLabel(self)
  return "$" .. tostring(self.priceCents / 100)
end
function Product.clone(self)
  local copy = {}
  for k, v in pairs(self) do copy[k] = v end
  setmetatable(copy, Product)
  return copy
end
function Product.toTable(self)
  return {
    name = self.name,
    priceCents = self.priceCents,
    stock = self.stock,
  }
end




--- Error variants for the calculator example.
local DivByZero = {}
DivByZero.__index = DivByZero
function DivByZero.new(data)
  data._struct = "DivByZero"
  setmetatable(data, DivByZero)
  return data
end

local UnknownOp = {}
UnknownOp.__index = UnknownOp
function UnknownOp.new(data)
  data._struct = "UnknownOp"
  setmetatable(data, UnknownOp)
  return data
end


--- Apply a binary operation, returning a Result.
function apply(a, op, b)
  return (function(__m)
    if __m == "+" then return Ok(a + b) end
    if __m == "-" then return Ok(a - b) end
    if __m == "*" then return Ok(a * b) end
    if __m == "/" then return (b == 0) and Err(DivByZero.new({})) or Ok(a / b) end
    return Err(UnknownOp.new({ op = op }))
  end)(op)
end


--- Render a calculator error to a human-readable string.
function describe(err)
  return (function(__m)
    if type(__m) == "table" and __m._struct == "DivByZero" then return "division by zero" end
    if type(__m) == "table" and __m._struct == "UnknownOp" then local op = __m.op; return "unknown operator: " .. op end
    error("match: no arm matched")
  end)(err)
end

