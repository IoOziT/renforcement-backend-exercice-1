import type { AddressInfo } from "node:net";
import type { Database } from "./database";

import os from "node:os";

import { serve, type HttpBindings } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import Consul from "consul";
import { Hono } from "hono";
import {
  CamelCasePlugin,
  Kysely,
  NoResultError,
  PostgresDialect,
} from "kysely";
import { Pool } from "pg";
import { z } from "zod";

import pkg from "#pkg";
import { formatHost, getActiveNetworkInterfaces } from "./utils";

const machineName = os.hostname();

const consul = new Consul({
  host: "service-discovery",
});
const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: process.env.SCHOOL_DATABASE_URL,
    }),
  }),
  plugins: [new CamelCasePlugin()],
});

const schoolIdParamValidator = zValidator(
  "param",
  z.object({
    schoolId: z.coerce.number().min(1),
  })
);
const schoolDataValidator = z.object({
  name: z.string().min(5),
  address: z.string().min(5),
  directorName: z.string().min(5),
});

export const app = new Hono<{ Bindings: HttpBindings }>()
  .notFound((ctx) =>
    ctx.json(
      {
        error: "School not found",
      },
      404
    )
  )
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
  .get("/", async (ctx) => {
    const schools = await db.selectFrom("schools").selectAll().execute();

    return ctx.json(schools);
  })
  .get("/:schoolId", schoolIdParamValidator, async (ctx) => {
    const { schoolId } = ctx.req.valid("param");
    const school = await db
      .selectFrom("schools")
      .selectAll()
      .where("id", "=", schoolId)
      .executeTakeFirstOrThrow();

    return ctx.json(school);
  })
  .post("/", zValidator("json", schoolDataValidator), async (ctx) => {
    const newSchoolData = ctx.req.valid("json");
    const newSchool = await db
      .insertInto("schools")
      .values(newSchoolData)
      .returningAll()
      .executeTakeFirstOrThrow();

    return ctx.json(newSchool, 201);
  })
  .patch(
    "/:schoolId",
    schoolIdParamValidator,
    zValidator("json", schoolDataValidator.partial()),
    async (ctx) => {
      const { schoolId } = ctx.req.valid("param");
      const schoolUpate = ctx.req.valid("json");
      const updatedSchool = await db
        .updateTable("schools")
        .set(schoolUpate)
        .where("id", "=", schoolId)
        .returningAll()
        .executeTakeFirstOrThrow();

      return ctx.json(updatedSchool);
    }
  )
  .delete("/:schoolId", schoolIdParamValidator, async (ctx) => {
    const { schoolId } = ctx.req.valid("param");

    await db
      .deleteFrom("schools")
      .where("id", "=", schoolId)
      .returning("id")
      .executeTakeFirstOrThrow();

    return ctx.body(null, 204);
  });

async function main() {
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
