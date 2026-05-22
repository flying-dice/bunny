import type { Email } from "../types/Email.ts";

export interface CreateUserDto {
  /**
   * @minLength 1
   * @maxLength 100
   */
  name: string;
  email: Email;
}
