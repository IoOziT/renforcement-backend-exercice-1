CREATE TABLE IF NOT EXISTS schools (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  address text NOT NULL,
  director_name text NOT NULL
);
