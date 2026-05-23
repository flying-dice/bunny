import { CreateTodoDto } from "../dtos/CreateTodoDto.ts";
import type { Todo } from "../entities/Todo.ts";
import * as todos from "../services/TodoService.ts";

export function listTodos(): Todo[] {
  return todos.list();
}

export function createTodo(body: CreateTodoDto): Todo {
  return todos.create(CreateTodoDto.new(body));
}

export function toggleTodo(id: string): Todo | { error: string } {
  const t = todos.toggle(id);
  return t ?? { error: "not found" };
}

export function deleteTodo(id: string): { ok: boolean } {
  return { ok: todos.remove(id) };
}

export const routes = {
  "/api/todos": { ...{ GET: (req: Request) => Response.json(listTodos()) }, ...{ POST: async (req: Request) => { const body = await req.json(); return Response.json(createTodo((body as any))); } } },
  "/api/todos/:id/toggle": { PATCH: (req: Request) => Response.json(toggleTodo((req as any).params?.id)) },
  "/api/todos/:id": { DELETE: (req: Request) => Response.json(deleteTodo((req as any).params?.id)) },
};

export const openapi = {
  "/api/todos": { ...{ get: {"operationId":"listTodos","parameters":[],"responses":{"200":{"description":"Successful response","content":{"application/json":{"schema":{"type":"array","items":{"$ref":"#/components/schemas/Todo"}}}}}}} as const }, ...{ post: {"operationId":"createTodo","parameters":[],"responses":{"200":{"description":"Successful response","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Todo"}}}}}} as const } },
  "/api/todos/{id}/toggle": { patch: {"operationId":"toggleTodo","parameters":[{"name":"id","in":"path","required":true,"schema":{"type":"string"}}],"responses":{"200":{"description":"Successful response","content":{"application/json":{"schema":{}}}}}} as const },
  "/api/todos/{id}": { delete: {"operationId":"deleteTodo","parameters":[{"name":"id","in":"path","required":true,"schema":{"type":"string"}}],"responses":{"200":{"description":"Successful response","content":{"application/json":{"schema":{"type":"null"}}}}}} as const },
};

export const client = {
  listTodos: async (): Promise<Awaited<ReturnType<typeof listTodos>>> => {
      const __res = await fetch("/api/todos", { method: "GET" });
      if (!__res.ok) throw new Error(`${"GET"} ${"/api/todos"} failed: ${__res.status}`);
      if (__res.status === 204) return undefined as unknown as Awaited<ReturnType<typeof listTodos>>;
      const __t = await __res.text();
      return (__t.length === 0 ? undefined : JSON.parse(__t)) as Awaited<ReturnType<typeof listTodos>>;
    },
  createTodo: async (body: Parameters<typeof createTodo>[0]): Promise<Awaited<ReturnType<typeof createTodo>>> => {
      const __res = await fetch("/api/todos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!__res.ok) throw new Error(`${"POST"} ${"/api/todos"} failed: ${__res.status}`);
      if (__res.status === 204) return undefined as unknown as Awaited<ReturnType<typeof createTodo>>;
      const __t = await __res.text();
      return (__t.length === 0 ? undefined : JSON.parse(__t)) as Awaited<ReturnType<typeof createTodo>>;
    },
  toggleTodo: async (id: Parameters<typeof toggleTodo>[0]): Promise<Awaited<ReturnType<typeof toggleTodo>>> => {
      const __res = await fetch(`/api/todos/${encodeURIComponent(String(id))}/toggle`, { method: "PATCH" });
      if (!__res.ok) throw new Error(`${"PATCH"} ${`/api/todos/${encodeURIComponent(String(id))}/toggle`} failed: ${__res.status}`);
      if (__res.status === 204) return undefined as unknown as Awaited<ReturnType<typeof toggleTodo>>;
      const __t = await __res.text();
      return (__t.length === 0 ? undefined : JSON.parse(__t)) as Awaited<ReturnType<typeof toggleTodo>>;
    },
  deleteTodo: async (id: Parameters<typeof deleteTodo>[0]): Promise<Awaited<ReturnType<typeof deleteTodo>>> => {
      const __res = await fetch(`/api/todos/${encodeURIComponent(String(id))}`, { method: "DELETE" });
      if (!__res.ok) throw new Error(`${"DELETE"} ${`/api/todos/${encodeURIComponent(String(id))}`} failed: ${__res.status}`);
      if (__res.status === 204) return undefined as unknown as Awaited<ReturnType<typeof deleteTodo>>;
      const __t = await __res.text();
      return (__t.length === 0 ? undefined : JSON.parse(__t)) as Awaited<ReturnType<typeof deleteTodo>>;
    },
};
//# sourceMappingURL=TodosController.ts.map
