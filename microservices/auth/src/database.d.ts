import type {
  Generated,
  GeneratedAlways,
  Insertable,
  Selectable,
  Updateable,
} from "kysely";

export interface UserTable {
  id: GeneratedAlways<number>;
  email: string;
  passwordHash: string;
  createdAt: Generated<Date>;
}

export type User = Selectable<UserTable>;

export type NewUser = Insertable<UserTable>;

export type UserUpdate = Updateable<UserTable>;

export interface Database {
  users: UserTable;
}
