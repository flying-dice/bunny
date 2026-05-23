import "../bunny.runtime.ts";
import { Email } from "../types/Email.ts";
import { Username } from "../types/Username.ts";

// Deep validation in action: `Registration.tryNew(...)` chains through
// `Email.tryNew` and `Username.tryNew` for the marked fields. The
// returned `Err({ field, message })` surfaces the innermost failure —
// e.g. a malformed email yields `field: "value"` (from Email's
// constraint), not the outer field name. The caller can use the
// message verbatim or dispatch on `field`.

export type Registration = {
  readonly _struct?: "Registration";
  email: Email;
  username: Username;
};
export const Registration = {
  new(data: Omit<Registration, "_struct">): Registration {
    data.email = Email.new(data.email);
    data.username = Username.new(data.username);
   return { ...data, _struct: "Registration" }; },

  tryNew(data: Omit<Registration, "_struct">): Result<Registration, ConstraintError> {
    const __r_email = Email.tryNew(data.email);
    if (!__r_email.ok) return __r_email;
    data.email = __r_email.value;
    const __r_username = Username.tryNew(data.username);
    if (!__r_username.ok) return __r_username;
    data.username = __r_username.value;
    return Ok({ ...data, _struct: "Registration" } as Registration);
  },
};
//# sourceMappingURL=Registration.ts.map
