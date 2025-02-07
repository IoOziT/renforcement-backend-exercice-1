import type { AddressInfo } from "node:net";
import type { Student } from "./documents";

import os from "node:os";

import { serve, type HttpBindings } from "@hono/node-server";
import Consul from "consul";
import { Hono } from "hono";
import { hc } from "hono/client";
import { MongoClient, MongoInvalidArgumentError, ObjectId } from "mongodb";

import { app as schoolApp } from "school";

import pkg from "#pkg";
import { formatHost, getActiveNetworkInterfaces } from "./utils";

const machineName = os.hostname();

const consul = new Consul({
  host: "service-discovery",
});
const mongoClient = new MongoClient(
  process.env.STUDENT_DATABASE_URL ?? "mongodb://mongodb"
);
const students = mongoClient
  .db("student-microservice")
  .collection<Student>("students");

const schoolService = hc<typeof schoolApp>("http://api-gateway:8080/schools");

export const app = new Hono<{ Bindings: HttpBindings }>()
  .notFound((ctx) =>
    ctx.json(
      {
        error: "Student not found",
      },
      404
    )
  )
  .onError((err, ctx) => {
    if (err instanceof MongoInvalidArgumentError) {
      return ctx.json(
        {
          errors: err.message,
        },
        400
      );
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
    return ctx.json(await students.find().toArray());
  })
  .get("/:studentId", async (ctx) => {
    const studentId = ctx.req.param("studentId");
    const student = await students.findOne({ _id: new ObjectId(studentId) });

    if (!student) {
      return ctx.notFound();
    }

    const { schoolId, ...restStudent } = student;
    const schoolResponse = await schoolService[":schoolId"].$get({
      param: {
        schoolId: String(student.schoolId),
      },
    });

    return ctx.json({
      ...restStudent,
      school:
        schoolResponse.status === 200 ? await schoolResponse.json() : null,
    });
  })
  .post("/", async (ctx) => {
    const newStudent = await ctx.req.json<Student>();
    const { insertedId: studentId } = await students.insertOne(newStudent);

    return ctx.json(
      {
        _id: studentId.toString("hex"),
        ...newStudent,
      },
      201
    );
  })
  .patch("/:studentId", async (ctx) => {
    const studentId = ctx.req.param("studentId");
    const studentUpate = await ctx.req.json<Partial<Student>>();
    const updatedStudent = await students.findOneAndUpdate(
      {
        _id: new ObjectId(studentId),
      },
      studentUpate
    );

    if (!updatedStudent) {
      return ctx.notFound();
    }

    return ctx.json(updatedStudent);
  })
  .delete("/:studentId", async (ctx) => {
    const studentId = ctx.req.param("studentId");
    const { deletedCount } = await students.deleteOne({
      _id: new ObjectId(studentId),
    });

    if (deletedCount === 0) {
      return ctx.notFound();
    }

    return ctx.body(null, 204);
  });

export type AppRoutes = typeof app;

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

main().catch(async (err) => {
  console.log("Server crashed :", err);

  await mongoClient.close(true);
});
