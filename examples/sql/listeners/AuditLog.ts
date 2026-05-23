import type { BookAdded } from "../events/BookAdded.ts";

export async function logBookAdded(event: BookAdded): Promise<void> {
  console.log(`[audit] book added: ${event.id} (${event.title})`);
}

export const __listener_logBookAdded: { event: string; handler: typeof logBookAdded } = { event: "BookAdded", handler: logBookAdded };
//# sourceMappingURL=AuditLog.ts.map
