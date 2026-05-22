# CSR example

A React frontend, bundled by Bun, talking to a Bunny-generated backend over `fetch`. The classic SPA shape — server ships HTML, browser does the painting — except the backend is a real Bunny app with controllers, services, validation, and DI.

## Run

```bash
bun run example:csr          # regenerate app.ts, routes.ts, openapi.json from the controllers
bun run example:csr:serve    # bun --hot examples/csr/server.ts
```

Open `http://localhost:3000`. Add a todo, toggle it, delete it — every call exercises a Bunny route. Try to add an empty title and you'll see Bunny's validation reject it with a `400`.

| Endpoint                       | Verb   | What it does                              |
| ------------------------------ | ------ | ----------------------------------------- |
| `/*`                           | GET    | Bun-bundled React app (`client/`).        |
| `/api/todos`                   | GET    | List todos.                               |
| `/api/todos`                   | POST   | Create one (`{ "title": "…" }`).          |
| `/api/todos/:id/toggle`        | PATCH  | Flip the `done` flag.                     |
| `/api/todos/:id`               | DELETE | Remove.                                   |

## What it shows

- **Bunny doing the backend**: a single `TodosController` with four routes, all four HTTP verbs, in fewer than 60 lines. `@inject todos` on the constructor pulls in the in-memory `TodoService`.
- **Validation crosses the wire**: `CreateTodoDto.title` has `@minLength 1 @maxLength 200`. The same constraints appear in `openapi.json` *and* run as TypeScript checks in `routes.ts` — a bad POST returns a structured `400` the React form can read.
- **Bun's HTML-import bundling, not webpack**: `server.ts` does `import index from "./client/index.html"` and Bun handles the rest — TSX, CSS, SVGs are bundled on the fly. HMR works in dev (`bun --hot`).
- **Spreadable routes**: `Bun.serve({ routes: { ...handlers, "/*": index } })` — Bunny's routes registered first, the SPA shell catches everything else.

## Layout

```
csr/
├── controllers/
│   └── TodosController.ts
├── services/
│   └── TodoService.ts
├── entities/
│   └── Todo.ts
├── dtos/
│   └── CreateTodoDto.ts
├── client/                   ← the React app (no controllers in here)
│   ├── index.html            (entry — Bun bundles its <script src>)
│   ├── frontend.tsx          (mounts React)
│   ├── App.tsx               (layout + composes the panels)
│   ├── TodoApp.tsx           (GET/POST/PATCH/DELETE against /api/todos)
│   ├── APITester.tsx         (free-form endpoint probe)
│   ├── index.css
│   ├── logo.svg
│   └── react.svg
├── app.ts                    (generated)
├── routes.ts                 (generated)
├── openapi.json              (generated)
├── bun-env.d.ts              (*.svg / *.css module shims for tsc)
└── server.ts                 (hand-written — spreads routes + HTML shell)
```

## Editing

Edit any file under `controllers/`, `services/`, `entities/`, or `dtos/` and re-run `bun run example:csr` to regenerate `app.ts` / `routes.ts` / `openapi.json`.

Edit anything under `client/` and the running `bun --hot` server hot-reloads the browser automatically — no regeneration needed because the React side isn't part of the Bunny codegen.
