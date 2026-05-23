import type { BookAdded } from "../events/BookAdded.ts";

export async function logBookAdded(event: BookAdded): Promise<void> {
  console.log(`[audit] book added: ${event.id} (${event.title})`);
}

export const listeners = {
  "BookAdded": [logBookAdded],
};
//# sourceMappingURL=AuditLog.ts.map
