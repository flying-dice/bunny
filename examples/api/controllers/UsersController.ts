import type {
  JsonResponse,
  TextResponse,
  TypedRequest,
  TypedResponse,
  XmlRequest,
  XmlResponse,
} from "../../../src/index.ts";
import type { CreateUserDto } from "../dtos/CreateUserDto.ts";
import type { User } from "../entities/User.ts";
import type { UsersService } from "../services/UsersService.ts";

/** @controller */
export class UsersController {
  /** @inject users */
  constructor(private users: UsersService) {}

  /**
   * List all users.
   * @get /users
   * @tag users
   */
  listUsers(req: TypedRequest<{ query: { limit?: string } }>): TypedResponse<User[]> {
    const n = req.query.limit ? Number(req.query.limit) : undefined;
    return Response.json(this.users.list(n));
  }

  /**
   * Fetch a single user.
   * @get /users/:id
   * @tag users
   */
  getUser(
    req: TypedRequest<{ params: { id: string } }>
  ): TypedResponse<User> | TypedResponse<{ message: string }, 404> {
    const user = this.users.find(req.params.id);
    if (!user) return Response.json({ message: "not found" }, { status: 404 });
    return Response.json(user);
  }

  /**
   * Create a new user.
   * @post /users
   * @tag users
   */
  async createUser(req: TypedRequest<{ body: CreateUserDto }>): Promise<TypedResponse<User, 201>> {
    const dto = await req.json();
    return Response.json(this.users.create(dto), { status: 201 });
  }

  /**
   * @delete /users/:id
   * @tag users
   */
  deleteUser(_req: TypedRequest<{ params: { id: string } }>): TypedResponse<void, 204> {
    return new Response(null, { status: 204 });
  }

  /**
   * Plain-text health check.
   * @get /health
   * @tag ops
   */
  health(_req: TypedRequest): TextResponse {
    return new Response("ok", { headers: { "content-type": "text/plain" } });
  }

  /**
   * Accept an XML payload describing a user. The runtime reads the body as
   * text and parses it however it likes — the generic just declares the
   * media type for the spec.
   * @post /users/xml
   * @tag users
   */
  async createFromXml(
    req: XmlRequest<{ body: CreateUserDto }>
  ): Promise<JsonResponse<User> | XmlResponse<User>> {
    const xml = await req.text();
    void xml;
    return Response.json({ id: "1", name: "from-xml", email: "x@example.com" });
  }
}
