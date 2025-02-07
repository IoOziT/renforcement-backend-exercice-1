import type { GeneratedAlways } from "kysely";

export interface School {
  id: GeneratedAlways<number>;
  name: string;
  address: string;
  directorName: string;
}

export interface Database {
  schools: School;
}
