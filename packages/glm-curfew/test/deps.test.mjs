import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { magpieConfigDir, zcodeCredentials, store, getRouting } from "../deps.mjs"

describe("zcodeCredentials", () => {
  test("只取 zcode oauth 且有 jwt 的条目；解析失败为空", async () => {
    const dir = join(import.meta.dir, "fixtures", "auth")
    const got = await zcodeCredentials(dir)
    expect(got).toHaveLength(2) // fixtures 里造 3 条：2 条有效，1 条缺 jwt
    expect(got[0].id.startsWith("zcode")).toBe(true)
    expect(typeof got[0].jwt).toBe("string")
    expect(got[0].jwt.length).toBeGreaterThan(0)
  })
  test("文件不存在 → 空数组不抛", async () => {
    expect(await zcodeCredentials(join(import.meta.dir, "nope"))).toEqual([])
  })
})

describe("store 原子读写", async () => {
  const mk = () => store(join(import.meta.dir, "fixtures", "state-" + Math.random().toString(36).slice(2, 8)))
  test("初始态", async () => {
    const s = await mk().load()
    expect(s.mode).toBe(null)
  })
  test("写后读回", async () => {
    const st = mk()
    await st.save({ version: 1, mode: "gift", saved: { g: "order" }, savedAt: "t" })
    const s = await st.load()
    expect(s.mode).toBe("gift")
    expect(s.saved.g).toBe("order")
  })
})

describe("magpieConfigDir", () => {
  test("从 moduleDir 上溯 plugins 的上一级", () => {
    const dir = magpieConfigDir({}, "/root/.config/magpie/plugins/node_modules/@magpie-community/page-glm-curfew")
    expect(dir.replace(/\\/g, "/")).toBe("/root/.config/magpie")
  })
  test("非插件路径退回 XDG", () => {
    const dir = magpieConfigDir({ XDG_CONFIG_HOME: "/tmp/cfg" }, "/somewhere/else")
    expect(dir.replace(/\\/g, "/")).toBe(join("/tmp/cfg", "magpie").replace(/\\/g, "/"))
  })
})
