import type { CreateTodoDto } from "../dtos/CreateTodoDto.ts";
import type { Todo } from "../entities/Todo.ts";

/**
 * In-memory todo store. Module-level singleton; the controller talks only
 * to this surface.
 *
 * @provides TodoService
 */
export class TodoService {
  private rows: Todo[] = [];

  list(): Todo[] {
    return this.rows;
  }

  create(dto: CreateTodoDto): Todo {
    const todo: Todo = { id: crypto.randomUUID(), title: dto.title, done: false };
    this.rows.push(todo);
    return todo;
  }

  toggle(id: string): Todo | undefined {
    const t = this.rows.find((r) => r.id === id);
    if (!t) return undefined;
    t.done = !t.done;
    return t;
  }

  remove(id: string): boolean {
    const i = this.rows.findIndex((r) => r.id === id);
    if (i < 0) return false;
    this.rows.splice(i, 1);
    return true;
  }
}
