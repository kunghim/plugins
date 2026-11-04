import { describe, expect, test } from "bun:test"
import { decide, giftLive, liveGiftsOf, perform } from "../core.mjs"

const NOW = Date.parse("2026-11-03T23:30:00+08:00")
const s = (iso) => Date.parse(iso) / 1000

describe("giftLive", () => {
  // 实证（2026-11-04）：生效时刻在 entitlement.effective_at，失效时刻在 plan.ends_at
  const plan = { name: "ZCODE GLOBAL BUILD", status: "active", ends_at: s("2026-11-04T09:00:00+08:00") }
  const live = { grant_units: 3e8, effective_at: s("2026-11-03T23:00:00+08:00") }
  test("生效区间内为真", () => expect(giftLive(plan, live, NOW)).toBe(true))
  test("生效前（到账未生效）为假", () => {
    const arrived = { ...live, effective_at: s("2026-11-03T23:30:01+08:00") } // now < effective
    expect(giftLive(plan, arrived, NOW)).toBe(false)
  })
  test("过期后为假", () => expect(giftLive(plan, live, Date.parse("2026-11-04T09:00:00+08:00"))).toBe(false))
  test("小额不算礼包（1e8 下限）", () => expect(giftLive(plan, { ...live, grant_units: 5e6 }, NOW)).toBe(false))
  test("字段缺失为假", () => expect(giftLive(plan, { grant_units: 3e8 }, NOW)).toBe(false))
  test("plan 缺 ends_at 为假", () => expect(giftLive({ status: "active" }, live, NOW)).toBe(false))
})

describe("liveGiftsOf", () => {
  test("跨 plan 汇总生效礼包；非 active 的 plan 跳过", () => {
    const d = {
      plans: [
        { name: "A", status: "active", ends_at: s("2026-11-04T09:00:00+08:00"), entitlements: [{ grant_units: 3e8, effective_at: s("2026-11-03T23:00:00+08:00"), capabilities: ["model:glm-5.3-flash"] }] },
        { name: "B", status: "expired", ends_at: s("2026-11-05T09:00:00+08:00"), entitlements: [{ grant_units: 3e8, effective_at: 0, capabilities: ["model:x"] }] },
      ],
    }
    const got = liveGiftsOf(d, NOW)
    expect(got).toHaveLength(1)
    expect(got[0].plan).toBe("A")
    expect(got[0].model).toBe("model:glm-5.3-flash")
    expect(got[0].endsAt).toBe(s("2026-11-04T09:00:00+08:00") * 1000)
  })
})

describe("decide 边沿", () => {
  const groups = ["g1", "g2"]
  test("无→有：切礼包并清空 saved", () => {
    const st = { mode: "user", saved: { g1: "order" }, savedAt: "t0" }
    const { next, actions } = decide(true, st, groups)
    expect(next.mode).toBe("gift")
    expect(actions).toEqual([
      { kind: "gift", group: "g1" },
      { kind: "gift", group: "g2" },
    ])
  })
  test("有→无：恢复各组记录的原值", () => {
    const st = { mode: "gift", saved: { g1: "order", g2: null }, savedAt: "t1" }
    const { next, actions } = decide(false, st, groups)
    expect(next.mode).toBe("user")
    expect(actions).toEqual([
      { kind: "restore", group: "g1", to: "order" },
      { kind: "restore", group: "g2", to: null },
    ])
  })
  test("期间反复观测不变：零动作（不覆盖用户调整）", () => {
    for (const obs of [true, true, false, false]) {
      const st = obs ? { mode: "gift", saved: {} } : { mode: "user", saved: {} }
      expect(decide(obs, st, groups).actions).toEqual([])
    }
  })
  test("观测未知（null，查询全失败）：绝不动作", () => {
    for (const st of [null, { mode: "gift", saved: {} }, { mode: "user", saved: {} }]) {
      expect(decide(null, st, groups).actions).toEqual([])
    }
  })
  test("首次启动（mode=null）观测无礼包：不动作", () => {
    expect(decide(false, null, groups).actions).toEqual([])
  })
  test("首次启动观测有礼包：也切（礼包模式是既定语义）", () => {
    const { next, actions } = decide(true, null, groups)
    expect(next.mode).toBe("gift")
    expect(actions).toHaveLength(2)
  })
})

describe("perform（注入假件）", () => {
  function fakeDeps(current) {
    const sets = []
    return {
      sets,
      giftRouting: "zcode-gift-window/gift-first",
      getRouting: async (g) => current[g] ?? null,
      setRouting: async (g, v) => {
        sets.push([g, v])
        current[g] = v
      },
    }
  }
  test("gift：记原值并切换", async () => {
    const cur = { g1: "order" }
    const d = fakeDeps(cur)
    const r = await perform({ kind: "gift", group: "g1" }, d)
    expect(r.saved).toBe("order")
    expect(d.sets).toEqual([["g1", "zcode-gift-window/gift-first"]])
  })
  test("gift：已是礼包模式则跳过且 saved=null（无用户原值可记）", async () => {
    const cur = { g1: "zcode-gift-window/gift-first" }
    const d = fakeDeps(cur)
    const r = await perform({ kind: "gift", group: "g1" }, d)
    expect(r.skipped).toBe(true)
    expect(r.saved).toBe(null)
    expect(d.sets).toEqual([])
  })
  test("restore：设回原值", async () => {
    const cur = { g1: "zcode-gift-window/gift-first" }
    const d = fakeDeps(cur)
    const r = await perform({ kind: "restore", group: "g1", to: "order" }, d)
    expect(r.set).toBe("order")
    expect(d.sets).toEqual([["g1", "order"]])
  })
  test("restore：无原值记录 → 跳过不动", async () => {
    const d = fakeDeps({ g1: "smart" })
    const r = await perform({ kind: "restore", group: "g1", to: null }, d)
    expect(r.skipped).toBe(true)
    expect(d.sets).toEqual([])
  })
  test("restore：当前已是原值 → 跳过", async () => {
    const d = fakeDeps({ g1: "order" })
    const r = await perform({ kind: "restore", group: "g1", to: "order" }, d)
    expect(r.skipped).toBe(true)
    expect(d.sets).toEqual([])
  })
})
