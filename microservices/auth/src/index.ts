import type { AddressInfo } from "node:net";
import type { Database, User } from "./database";

import os from "node:os";

import { serve, type HttpBindings } from "@hono/node-server";
import Consul from "consul";
import { Hono } from "hono";
import {
  CamelCasePlugin,
  Kysely,
  NoResultError,
  PostgresDialect,
} from "kysely";

import pkg from "#pkg";
import { zValidator } from "@hono/zod-validator";
import argon2 from "@node-rs/argon2";
import jwt from "jsonwebtoken";
import { Pool } from "pg";
import { z } from "zod";
import { formatHost, getActiveNetworkInterfaces } from "./utils";

const machineName = os.hostname();

const consul = new Consul({
  host: "service-discovery",
});
const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.AUTH_DATABASE_URL,
    }),
  }),
  plugins: [new CamelCasePlugin()],
});

const authPayloadValidator = zValidator(
  "json",
  z.object({
    email: z.string().email(),
    password: z.string().min(8),
  })
);

const getJwtToken = (user: Omit<User, "passwordHash">) =>
  jwt.sign(user, process.env.AUTH_SECRET!, {
    audience: "http://api-gateway:8080",
    subject: user.email,
    issuer: "Auth microservice",
  });

export const app = new Hono<{ Bindings: HttpBindings }>()
  .onError((err, ctx) => {
    if (err instanceof NoResultError) {
      return ctx.notFound();
    }

    console.log(err);

    return ctx.json(
      {
        error: "Server error",
      },
      500
    );
  })
  .use(async (ctx, next) => {
    ctx.header("X-Container", machineName);

    await next();
  })
  .get("/health", (ctx) => {
    const { localAddress: ip, localPort: port } = ctx.env.incoming.socket;

    return ctx.json({
      service: {
        name: pkg.name,
        version: pkg.version,
      },
      ip,
      port,
    });
  })
  .post("/login", authPayloadValidator, async (ctx) => {
    const { email, password } = ctx.req.valid("json");
    const fullUser = await db
      .selectFrom("users")
      .selectAll()
      .where("email", "=", email)
      .executeTakeFirst();

    if (!fullUser || !(await argon2.verify(fullUser.passwordHash, password))) {
      return ctx.json(
        {
          error: "Unknown credentials",
        },
        401
      );
    }

    const { passwordHash, ...user } = fullUser;
    const token = getJwtToken(user);

    return ctx.json({
      user,
      token,
    });
  })
  .post("/signup", authPayloadValidator, async (ctx) => {
    const { email, password } = ctx.req.valid("json");
    const user = await db
      .insertInto("users")
      .values({
        email,
        passwordHash: await argon2.hash(password),
      })
      .returning(["id", "email", "createdAt"])
      .executeTakeFirstOrThrow();

    const token = getJwtToken(user);

    return ctx.json({
      user,
      token,
    });
  });

async function main() {
  if (!process.env.AUTH_SECRET) {
    throw new Error("No JWT secret provided");
  }

  const server = serve(app);
  const stopServer = () => {
    console.log("Shutting down...");

    server.close();
  };

  new Array<NodeJS.Signals>("SIGTERM", "SIGINT").map((signal) =>
    process.on(signal, stopServer)
  );

  const info = server.address() as AddressInfo;
  const localhost = formatHost(info);

  const activeNetworkInterfaces = getActiveNetworkInterfaces();

  const serverHosts = await Promise.all(
    activeNetworkInterfaces.map(async (activeNetworkInterface) => {
      const host = formatHost({
        address: activeNetworkInterface.address,
        family: activeNetworkInterface.family,
        port: info.port,
      });

      await consul.agent.service.register({
        id: `${pkg.name}:${machineName}:${Math.floor(Math.random() * 10)}`,
        name: pkg.name,
        port: info.port,
        address: activeNetworkInterface.address,
        meta: {
          version: pkg.version,
        },
        check: {
          name: `Service ${pkg.name} status`,
          http: `http://${host}/health`,
          interval: "30s",
          timeout: "30s",
          deregistercriticalserviceafter: "60s",
        },
      });

      return host;
    })
  );

  console.log(`Listening on ${[localhost, ...serverHosts].join(", ")}`);
}

main().catch((err) => {
  console.log(err);

  process.exitCode = 1;
});
