import type { JsonResponse, TypedRequest, TypedResponse } from "../../../src/index.ts";
import type { CreateTodoDto } from "../dtos/CreateTodoDto.ts";
import type { Todo } from "../entities/Todo.ts";
import type { TodoService } from "../services/TodoService.ts";

/** @controller */
export class TodosController {
  /** @inject todos */
  constructor(private todos: TodoService) {}

  /**
   * List every todo.
   * @get /api/todos
   * @tag todos
   */
  listTodos(_req: TypedRequest): JsonResponse<Todo[]> {
    return Response.json(this.todos.list());
  }

  /**
   * Create a todo.
   * @post /api/todos
   * @tag todos
   */
  async createTodo(req: TypedRequest<{ body: CreateTodoDto }>): Promise<TypedResponse<Todo, 201>> {
    const dto = await req.json();
    return Response.json(this.todos.create(dto), { status: 201 });
  }

  /**
   * Toggle a todo's `done` flag.
   * @patch /api/todos/:id/toggle
   * @tag todos
   */
  toggleTodo(
    req: TypedRequest<{ params: { id: string } }>
  ): TypedResponse<Todo> | TypedResponse<{ message: string }, 404> {
    const t = this.todos.toggle(req.params.id);
    if (!t) return Response.json({ message: "not found" }, { status: 404 });
    return Response.json(t);
  }

  /**
   * Delete a todo.
   * @delete /api/todos/:id
   * @tag todos
   */
  deleteTodo(
    req: TypedRequest<{ params: { id: string } }>
  ): TypedResponse<void, 204> | TypedResponse<{ message: string }, 404> {
    if (!this.todos.remove(req.params.id)) {
      return Response.json({ message: "not found" }, { status: 404 });
    }
    return new Response(null, { status: 204 });
  }
}
