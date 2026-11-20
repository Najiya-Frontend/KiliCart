import { test, after } from "node:test";
import assert from "node:assert/strict";
import app from "../src/app.js";
import { prisma } from "../src/config/prisma.js";

const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await prisma.$disconnect();
});

test("health and unknown routes retain their responses", async () => {
  const health = await fetch(`${base}/api/v1/health`);
  assert.equal(health.status, 200);
  const body = await health.json();
  assert.equal(body.data.service, "kilicart-api");
  assert.equal(body.data.status, "healthy");
  const missing = await fetch(`${base}/api/v1/unknown`);
  assert.equal(missing.status, 404);
});

test("database health queries the configured database", async () => {
  const result = await prisma.$queryRaw`SELECT DATABASE() AS db`;
  assert.equal(result[0].db, "kilicart_dev");
  const response = await fetch(`${base}/api/v1/health/database`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    success: true,
    message: "KiliCart database connection successful",
    data: { database: "connected", status: "healthy" },
  });
});

test("database errors produce a safe 503", async () => {
  const original = prisma.$queryRaw;
  const originalLog = console.error;
  try {
    prisma.$queryRaw = async () => { throw new Error("private database diagnostic"); };
    console.error = () => {};
    const response = await fetch(`${base}/api/v1/health/database`);
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.doesNotMatch(text, /private database diagnostic|mysql:|stack/i);
    assert.deepEqual(JSON.parse(text), {
      success: false,
      message: "KiliCart database connection unavailable",
      data: { database: "disconnected", status: "unhealthy" },
    });
  } finally {
    prisma.$queryRaw = original;
    console.error = originalLog;
  }
});
