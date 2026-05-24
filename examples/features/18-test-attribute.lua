--- `#[test]` on an exported fn registers it with the module's
--- `__neoc_tests` table. `neoc test` discovers every registration
--- across all `.neoc` files, runs each through `luau`, and reports
--- pass/fail counts.

-- Runtime bindings used by this example.


function addition_works()
  assert(1 + 1 == 2)
end


function string_concat_works()
  assert("hello" .. " " .. "world" == "hello world")
end


__neoc_tests = __neoc_tests or {}
__neoc_tests[#__neoc_tests + 1] = { name = "addition_works", run = addition_works }
__neoc_tests = __neoc_tests or {}
__neoc_tests[#__neoc_tests + 1] = { name = "string_concat_works", run = string_concat_works }
