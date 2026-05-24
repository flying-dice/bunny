--- `Self` (capital S) is the type-level placeholder for the implementing
--- struct inside a trait declaration or impl block. The codegen
--- substitutes it with the target struct's name at emit time.


local Box = {}
Box.__index = Box
function Box.new(data)
  data._struct = "Box"
  setmetatable(data, Box)
  return data
end

function Box.double(self)
  return Box.new({ count = self.count * 2 })
end



