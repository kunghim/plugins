// glm-curfew 的真实依赖组装：读 ZCode 余额、读/写 magpie 分组、本地状态、日志。
// 与 core.mjs 的纯逻辑分离 —— 这一层才碰网络/文件/子进程。
import { readFile, writeFile, rename, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import { spawnFile } from "./cli.mjs"
import { liveGiftsOf } from "./core.mjs"

const ZCODE_BALANCE = "https://zcode.z.ai/api/v1/zcode-plan/billing/balance?app_version=3.16.3"
const UA = "ZCode/3.16.3"
const AUTH_TIMEOUT_MS = 12_000

/** magpie 配置目录（对齐 warmup 的 magpieDirs：插件装在 plugins/node_modules 下时上溯） */
export function magpieConfigDir(env = process.env, moduleDir = import.meta.dir) {
  const xdg = env.XDG_CONFIG_HOME && /^[/\\]|^[A-Za-z]:/.test(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : join(homedir(), ".config")
  const seg = moduleDir.split(/[\\/]/).filter(Boolean)
  const i = seg.lastIndexOf("plugins")
  if (i > 0) return join("/", ...seg.slice(0, i))
  return join(xdg, "magpie")
}

/** 读 plugin-auth.json 里全部 zcode oauth 账号的 jwt/device（绝不返回密钥给调用方之外的地方） */
export async function zcodeCredentials(configDir) {
  let raw
  try {
    raw = await readFile(join(configDir, "plugin-auth.json"), "utf8")
  } catch {
    return []
  }
  let auth
  try {
    auth = JSON.parse(raw)
  } catch {
    return []
  }
  const out = []
  for (const [k, v] of Object.entries(auth ?? {})) {
    if (!k.startsWith("zcode") || v?.type !== "oauth") continue
    let s = {}
    try {
      s = JSON.parse(v.refresh ?? "{}")
    } catch {}
    if (s.jwt) out.push({ id: k, jwt: s.jwt, device: s.device ?? "" })
  }
  return out
}

/** 查一个账号的生效礼包；网络/解析失败抛错（调用方决定怎么算） */
export async function fetchLiveGifts(cred, signal) {
  const res = await fetch(ZCODE_BALANCE, {
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA, Authorization: "Bearer " + cred.jwt, "X-Device-Mid": cred.device },
    signal,
  })
  if (!res.ok) throw new Error(`zcode balance HTTP ${res.status}`)
  const body = await res.json()
  const d = body?.data ?? {}
  return liveGiftsOf(d)
}

/** 观测：任一账号有生效礼包 → true；全部正常应答且无 → false；全部失败 → null（维持现状） */
export async function observeGift(configDir, log = () => {}) {
  const creds = await zcodeCredentials(configDir)
  if (!creds.length) {
    log("no zcode credentials")
    return null
  }
  const results = await Promise.allSettled(
    creds.map((c) => {
      const ctl = new AbortController()
      const t = setTimeout(() => ctl.abort(), AUTH_TIMEOUT_MS)
      return fetchLiveGifts(c, ctl.signal).finally(() => clearTimeout(t))
    }),
  )
  let sawAny = false
  let okAny = false
  const gifts = []
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      okAny = true
      if (r.value.length) {
        sawAny = true
        gifts.push(...r.value.map((g) => ({ ...g, account: creds[i].id })))
      }
    } else {
      log(`zcode read failed for ${creds[i].id}: ${r.reason?.message ?? r.reason}`)
    }
  })
  if (!okAny) return null // 全失败：维持现状
  return { active: sawAny, gifts }
}

/** 读一个分组的 routing：从 providers.json（magpie 持久化处） */
export async function getRouting(configDir, group) {
  try {
    const d = JSON.parse(await readFile(join(configDir, "providers.json"), "utf8"))
    const g = (d.groups ?? []).find((x) => x?.id === group)
    return typeof g?.routing === "string" ? g.routing : null
  } catch {
    return null
  }
}

/** 写一个分组的 routing：magpie CLI 是权威通道（内部会触发 reload）。 */
export function setRouting(magpieBin, group, value, log = () => {}) {
  return spawnFile(magpieBin, ["group", "set", group, `routing=${value}`], log)
}

/** 状态文件：原子写、损坏视为初始态 */
export function store(configDir) {
  const dir = join(configDir, "glm-curfew")
  const file = join(dir, "state.json")
  return {
    async load() {
      try {
        const s = JSON.parse(await readFile(file, "utf8"))
        if (s?.version !== 1) return { version: 1, mode: null, saved: {}, savedAt: null, lastAction: null }
        return s
      } catch {
        return { version: 1, mode: null, saved: {}, savedAt: null, lastAction: null }
      }
    },
    async save(s) {
      await mkdir(dir, { recursive: true })
      const tmp = file + ".tmp"
      await writeFile(tmp, JSON.stringify(s, null, 1))
      await rename(tmp, file)
    },
    file,
  }
}

export { spawnFile }
