import { type FormEvent, useCallback, useEffect, useState } from "react";

interface Todo {
  id: string;
  title: string;
  done: boolean;
}

/**
 * Talks to the bunny-generated TodosController over `fetch`:
 *
 *   GET    /api/todos              list
 *   POST   /api/todos              create
 *   PATCH  /api/todos/:id/toggle   toggle done
 *   DELETE /api/todos/:id          delete
 */
export function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/todos");
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setTodos(await r.json());
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const res = await fetch("/api/todos", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: data.get("title") }),
    });
    if (res.ok) {
      form.reset();
      reload();
    } else {
      const j = await res.json().catch(() => ({}));
      setError(`POST /api/todos ${res.status}: ${j.reason ?? "failed"}`);
    }
  }

  async function toggle(id: string) {
    await fetch(`/api/todos/${id}/toggle`, { method: "PATCH" });
    reload();
  }

  async function remove(id: string) {
    await fetch(`/api/todos/${id}`, { method: "DELETE" });
    reload();
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
