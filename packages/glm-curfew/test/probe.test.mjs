import { describe, expect, test } from "bun:test"
import { alreadyServing } from "../probe.mjs"

describe("alreadyServing 端口探测", () => {
  test("响应带本插件标记头 → true", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response("{}", { headers: { "x-glm-curfew": "1" } }),
    })
    try {
      expect(await alreadyServing(server.port)).toBe(true)
    } finally {
      server.stop(true)
    }
  })
  test("端口上有别的程序（无标记头）→ false", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response("{}"),
    })
    try {
      expect(await alreadyServing(server.port)).toBe(false)
    } finally {
      server.stop(true)
    }
  })
  test("端口没人听 → false（不抛）", async () => {
    expect(await alreadyServing(1)).toBe(false)
  })
})
