import type { Email } from "../types/Email.ts";
import type { Uuid } from "../types/Uuid.ts";

export interface User {
  id: Uuid;
  /**
   * Display name.
   * @minLength 1
   * @maxLength 100
   */
  name: string;
  email: Email;
  /**
   * @minimum 0
   * @maximum 150
   */
  age?: number;
}
