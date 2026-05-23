import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  BunnyClientError,
  createTodo,
  deleteTodo,
  listTodos,
  toggleTodo,
} from "../client.ts";
import type { Todo } from "../entities/Todo.ts";

/**
 * Talks to the bunny-generated function-style client. Each controller
 * function (server-side) maps to a same-named typed function (client-side),
 * so the React app and the routes evolve together at compile time.
 */
export function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setTodos(await listTodos());
      setError(null);
    } catch (e) {
      setError(formatError(e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    try {
      await createTodo({ title: String(data.get("title") ?? "") });
      form.reset();
      await reload();
    } catch (e) {
      setError(formatError(e));
    }
  }

  async function toggle(id: string) {
    try {
      await toggleTodo(id);
      await reload();
    } catch (e) {
      setError(formatError(e));
    }
  }

  async function remove(id: string) {
    try {
      await deleteTodo(id);
      await reload();
    } catch (e) {
      setError(formatError(e));
    }
  }

  return (
    <section className="panel">
      <h2>Todos</h2>
      {error && <p className="error">{error}</p>}
      {todos.length === 0 ? (
        <p className="muted">Nothing yet — add one below.</p>
      ) : (
        <ul className="todos">
          {todos.map((t) => (
            <li key={t.id}>
              <label className={t.done ? "done" : ""}>
                <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} /> {t.title}
              </label>
              <button type="button" onClick={() => remove(t.id)} className="remove">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={create} className="endpoint-row">
        <input
          type="text"
          name="title"
          placeholder="What needs doing?"
          className="url-input"
          required
          minLength={1}
          maxLength={200}
        />
        <button type="submit" className="send-button">
          Add
        </button>
      </form>
    </section>
  );
}

function formatError(err: unknown): string {
  if (err instanceof BunnyClientError) return err.message;
  return err instanceof Error ? err.message : String(err);
}
