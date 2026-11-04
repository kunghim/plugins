// glm-curfew 宿主入口：magpie 调 server() 时启动本地服务与调度器。
// 单纯 import 不占端口不占定时器（对齐 window-warmup 的单例约定）。
// 状态目录：<magpie 配置目录>/glm-curfew（index 与 deps 共用 magpieConfigDir，勿自拼）
// 注意：宿主会把模块导出的每个函数都当插件函数调（check.mjs 约定），
// 所以内部函数一律不导出。
import { join } from "node:path"

const DEFAULT_PORT = 3493
const TICK_MS = 5 * 60_000
const TIMER_CAP_MS = 10 * 60_000

/** 端口 → 启动中的服务；按端口分键 */
const instances = new Map()

export default {
  id: "magpie-glm-curfew",
  server: async (_input, opts = {}) => {
    const port = Number(opts?.port)
    const listen = Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT
    if (instances.has(listen)) return {}
    const instance = start(listen, opts).catch((e) => {
      instances.delete(listen)
      throw e
    })
    instances.set(listen, instance)
    await instance
    return {}
  },
}

async function start(port, opts) {
  const [{ magpieConfigDir, observeGift, getRouting, setRouting, store }, { decide, perform }] = await Promise.all([
    import("./deps.mjs"),
    import("./core.mjs"),
  ])
  const env = process.env
  const configDir = magpieConfigDir(env)
  // 状态文件直接放 magpie 配置目录下（与 deps.mjs 的 store 用同一拼法，勿再自拼）
  const dir = configDir
  const st = store(dir)
  const groups = Array.isArray(opts.groups) && opts.groups.length ? opts.groups.map(String) : ["auto-glm-5-3-flash", "auto-glm-5-3"]
  const giftRouting = typeof opts.giftRouting === "string" && opts.giftRouting ? opts.giftRouting : "zcode-gift-window/gift-first"
  const magpieBin = typeof opts.magpieBin === "string" && opts.magpieBin ? opts.magpieBin : "/opt/magpie/magpie"

  const logs = []
  const log = (m) => {
    const line = `${new Date().toISOString()} ${m}`
    logs.push(line)
    if (logs.length > 200) logs.splice(0, logs.length - 200)
    console.log(`[glm-curfew] ${m}`)
  }

  const runtime = {
    paused: false,
    lastObserved: null, // true/false/null
    lastTickAt: null,
    nextTickAt: null,
    gifts: [],
  }

  async function tick() {
    runtime.lastTickAt = new Date().toISOString()
    if (runtime.paused) {
      runtime.nextTickAt = new Date(Date.now() + TICK_MS).toISOString()
      return
    }
    const obs = await observeGift(configDir, log)
    runtime.lastObserved = obs === null ? null : obs.active
    runtime.gifts = obs?.gifts ?? []
    const state = await st.load()
    const { next, actions } = decide(runtime.lastObserved, state, groups)
    if (actions.length) {
      const done = []
      for (const a of actions) {
        try {
          const r = await perform(a, {
            getRouting: (g) => getRouting(configDir, g),
            setRouting: (g, v) => setRouting(magpieBin, g, v, log),
            giftRouting,
          })
          done.push(r)
          log(`${a.kind} ${a.group}: ${JSON.stringify(r)}`)
        } catch (e) {
          log(`action failed ${a.kind} ${a.group}: ${e?.message ?? e}`)
        }
      }
      next.lastAction = { at: new Date().toISOString(), kind: actions[0].kind, results: done }
      // 只有全部动作成功才落新状态；有失败保持旧状态，下轮重试
      if (done.length === actions.length) await st.save(next)
      else log("state kept for retry")
    }
    runtime.nextTickAt = new Date(Date.now() + TICK_MS).toISOString()
  }

  function schedule() {
    const wait = Math.min(TICK_MS, TIMER_CAP_MS)
    return setTimeout(async () => {
      try {
        await tick()
      } catch (e) {
        log(`tick error: ${e?.message ?? e}`)
      }
      timer = schedule()
    }, wait)
  }
  let timer = schedule()

  // 首轮立即跑（启动即对齐现状）
  tick().catch((e) => log(`first tick error: ${e?.message ?? e}`))

  const json = (body, code = 200) => new Response(JSON.stringify(body ?? {}), { status: code, headers: { "content-type": "application/json; charset=utf-8", "x-glm-curfew": "1" } })

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === "/status") {
        const s = await st.load()
        return json({
          paused: runtime.paused,
          lastObserved: runtime.lastObserved,
          gifts: runtime.gifts,
          lastTickAt: runtime.lastTickAt,
          nextTickAt: runtime.nextTickAt,
          state: { mode: s.mode, saved: s.saved, savedAt: s.savedAt, lastAction: s.lastAction },
          groups,
          giftRouting,
          configDir,
          stateFile: st.file,
          logs: logs.slice(-40),
        })
      }
      if (url.pathname === "/pause" && req.method === "POST") {
        runtime.paused = true
        log("paused")
        return json({ paused: true })
      }
      if (url.pathname === "/resume" && req.method === "POST") {
        runtime.paused = false
        log("resumed")
        return json({ paused: false })
      }
      if (url.pathname === "/tick" && req.method === "POST") {
        await tick()
        return json({ ok: true })
      }
      return json({ error: "not found" }, 404)
    },
  })

  log(`serving on :${port}; groups=${groups.join(",")}; giftRouting=${giftRouting}`)
  return { server, dir }
}
