export interface Todo {
  /** @format uuid */
  id: string;
  /** @minLength 1 @maxLength 200 */
  title: string;
  done: boolean;
}
