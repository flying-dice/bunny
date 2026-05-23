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

export const __route_listTodos: { method: "GET"; path: "/api/todos"; params: { name: string; type: string }[]; handler: typeof listTodos } = { method: "GET", path: "/api/todos", params: [], handler: listTodos };
export const __openapi_listTodos = {"operationId":"listTodos","method":"GET","path":"/api/todos","parameters":[],"responses":{"200":{"description":"Successful response","content":{"application/json":{"schema":{"type":"array","items":{"$ref":"#/components/schemas/Todo"}}}}}}} as const;
export const __route_createTodo: { method: "POST"; path: "/api/todos"; params: { name: string; type: string }[]; handler: typeof createTodo } = { method: "POST", path: "/api/todos", params: [{"name":"body","type":"CreateTodoDto"}], handler: createTodo };
export const __openapi_createTodo = {"operationId":"createTodo","method":"POST","path":"/api/todos","parameters":[],"responses":{"200":{"description":"Successful response","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Todo"}}}}}} as const;
export const __route_toggleTodo: { method: "PATCH"; path: "/api/todos/:id/toggle"; params: { name: string; type: string }[]; handler: typeof toggleTodo } = { method: "PATCH", path: "/api/todos/:id/toggle", params: [{"name":"id","type":"string"}], handler: toggleTodo };
export const __openapi_toggleTodo = {"operationId":"toggleTodo","method":"PATCH","path":"/api/todos/{id}/toggle","parameters":[{"name":"id","in":"path","required":true,"schema":{"type":"string"}}],"responses":{"200":{"description":"Successful response","content":{"application/json":{"schema":{}}}}}} as const;
export const __route_deleteTodo: { method: "DELETE"; path: "/api/todos/:id"; params: { name: string; type: string }[]; handler: typeof deleteTodo } = { method: "DELETE", path: "/api/todos/:id", params: [{"name":"id","type":"string"}], handler: deleteTodo };
export const __openapi_deleteTodo = {"operationId":"deleteTodo","method":"DELETE","path":"/api/todos/{id}","parameters":[{"name":"id","in":"path","required":true,"schema":{"type":"string"}}],"responses":{"200":{"description":"Successful response","content":{"application/json":{"schema":{"type":"null"}}}}}} as const;
//# sourceMappingURL=TodosController.ts.map
