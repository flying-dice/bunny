--- Rust-style triple-slash doc comments document the declaration that
--- immediately follows. The LSP surfaces the body as markdown in hover
--- popups and completion previews.
---
--- `///` lines and `/** … */` blocks are translated to Lua's `---` /
--- `--[[ … ]]` forms during codegen so the documentation survives in
--- the emitted source.
local DocumentedThing = {}
DocumentedThing.__index = DocumentedThing
function DocumentedThing.new(data)
  data._struct = "DocumentedThing"
  setmetatable(data, DocumentedThing)
  return data
end


--- The canonical greeting routine.
---
--- Returns a friendly hello prefixed with the supplied name.
function greet(name)
  return "Hello, " .. name
end

