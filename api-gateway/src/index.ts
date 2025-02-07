import { serve } from "@hono/node-server";
import Consul from "consul";
import { Hono, type Context } from "hono";
import jwt from "jsonwebtoken";

const serviceMap = {
  auth: "auth",
  schools: "school",
  students: "student",
} as Record<string, string>;

const consul = new Consul({ host: "service-discovery" });

const getRandomServiceInstance = async (serviceName: string) => {
  const nodes = await consul.catalog.service.nodes(serviceName);
  const selectedNode = nodes[Math.floor(Math.random() * nodes.length)];

  if (!nodes.length) {
    throw new Error("Service not available");
  }

  return `${selectedNode.ServiceAddress ?? selectedNode.Address}:${
    selectedNode.ServicePort ?? 80
  }`;
};

const authorizationHeaderPrefix = process.env.AUTH_HEADER_PREFIX ?? "Bearer";
const authenticate = async (ctx: Context) => {
  const authorizationHeader = ctx.req.header("Authorization");

  if (!authorizationHeader?.startsWith(authorizationHeaderPrefix)) {
    return null;
  }

  const [, token] = authorizationHeader.split(" ", 2);

  if (!token) {
    return null;
  }

  try {
    return jwt.verify(token, process.env.AUTH_SECRET!);
  } catch (e) {
    return null;
  }
};

const app = new Hono()
  .get("/health", (ctx) =>
    ctx.json({
      status: "Up",
      services: Object.keys(serviceMap),
    })
  )
  .all("/:servicePrefix/*", async (ctx) => {
    const servicePrefix = ctx.req.param("servicePrefix");

    if (servicePrefix !== "auth" && (await authenticate(ctx)) === null) {
      return ctx.json(
        {
          error: "Invalid authorization",
        },
        401
      );
    }

    if (servicePrefix in serviceMap) {
      const serviceHost = await getRandomServiceInstance(
        serviceMap[servicePrefix]
      );

      const serviceUrl = new URL(ctx.req.url);
      serviceUrl.host = serviceHost;
      serviceUrl.pathname = serviceUrl.pathname.slice(servicePrefix.length + 1);

      return fetch(serviceUrl, {
        redirect: "manual",
        method: ctx.req.method,
        headers: {
          ...ctx.req.header(),
          Host: serviceHost,
        },
        body: ["HEAD", "GET"].includes(ctx.req.method)
          ? null
          : await ctx.req.raw.blob(),
        referrer: ctx.req.raw.referrer,
        referrerPolicy: ctx.req.raw.referrerPolicy,
        mode: ctx.req.raw.mode,
        credentials: ctx.req.raw.credentials,
        cache: ctx.req.raw.cache,
        integrity: ctx.req.raw.integrity,
      });
    }

    return ctx.notFound();
  });

const server = serve(
  {
    fetch: app.fetch,
    port: 8080,
  },
  (info) =>
    console.log(
      `Ready to forward requests from ${
        info.family === "IPv6" ? `[${info.address}]` : info.address
      }:${info.port}`
    )
);
const stopServer = () => {
  console.log("Shutting down...");

  server.close();
};

new Array<NodeJS.Signals>("SIGTERM", "SIGINT").map((signal) =>
  process.on(signal, stopServer)
);
