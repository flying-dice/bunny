import type { CreateUserDto } from "../dtos/CreateUserDto.ts";
import type { User } from "../entities/User.ts";

const DB: User[] = [
  { id: "1", name: "Ada", email: "ada@example.com" },
  { id: "2", name: "Grace", email: "grace@example.com" },
];

/**
 * Business logic for users. The controller talks only to this surface.
 *
 * @provides UsersService
 */
export class UsersService {
  list(limit?: number): User[] {
    return limit === undefined ? DB : DB.slice(0, limit);
  }
  find(id: string): User | undefined {
    return DB.find((u) => u.id === id);
  }
  create(dto: CreateUserDto): User {
    const user: User = { id: String(DB.length + 1), name: dto.name, email: dto.email };
    DB.push(user);
    return user;
  }
}
