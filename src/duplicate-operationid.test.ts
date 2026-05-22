import { beforeAll, expect, test } from "bun:test";
import * as path from "node:path";
import { generate } from "./index.ts";

const fixture = path.resolve(".tmp/duplicate-controllers.ts");

beforeAll(async () => {
  await Bun.write(
    fixture,
    `import type { TypedRequest, TypedResponse } from "${path.resolve("src/index.ts")}";

/** @controller */
export class UsersController {
  /** @get /users */
  list(req: TypedRequest): TypedResponse<unknown[]> {
    return Response.json([]);
  }
}

/** @controller */
export class PostsController {
  /** @get /posts */
  list(req: TypedRequest): TypedResponse<unknown[]> {
    return Response.json([]);
  }
}
`
  );
});

test("colliding method names across controllers throw at codegen time", () => {
  expect(() => generate({ sourceFiles: fixture })).toThrow(
    /duplicate operationId\(s\)[\s\S]*"list"[\s\S]*Controller\.list[\s\S]*Controller\.list/
  );
});
