// glm-curfew 的核心逻辑：礼包状态判定与边沿动作。
// 纯函数 + 可注入依赖，不碰网络/文件系统/进程 —— 全部通过 deps 注入，
// 测试用假件；index.mjs 里组装真实依赖。
//
// 用户语义（多轮确认，不可违背）：
// 1. 生效才切（effective_at ≤ now < ends_at），不是到账（starts_at）就切
// 2. 平台不一定每天发礼包 —— 没发就没动作
// 3. 边沿触发：只在 无→有 跳变时切一次；有→无 时恢复记录的用户配置
// 4. 全部住在 magpie 进程内，无外部定时器

/** 一条 (plan, entitlement) 是否构成"正在生效的大额礼包"。
 * 生效时刻在 entitlement.effective_at；失效时刻在 plan.ends_at（entitlement 上没有 ends_at——
 * 2026-11-04 对真实接口实证，effective 23:00 / plan ends 次日 09:00） */
export function giftLive(plan, ent, now = Date.now()) {
  if (!plan || !ent || typeof ent !== "object") return false
  const grant = Number(ent.grant_units)
  if (!Number.isFinite(grant) || grant < 1e8) return false
  const eff = secToMs(ent.effective_at)
  const end = secToMs(plan.ends_at)
  if (eff === null || end === null) return false
  return eff <= now && now < end
}

function secToMs(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return null
  return n * 1000 // 平台是秒级 epoch
}

/** 从 balance 响应里提取"生效中的礼包"列表（跨所有 plans 的 entitlements） */
export function liveGiftsOf(balanceData, now = Date.now()) {
  const out = []
  for (const p of Array.isArray(balanceData?.plans) ? balanceData.plans : []) {
    if (String(p?.status ?? "").toLowerCase() !== "active") continue
    for (const e of Array.isArray(p?.entitlements) ? p.entitlements : []) {
      if (giftLive(p, e, now)) out.push({ plan: String(p?.name ?? ""), model: e?.capabilities?.[0] ?? "", grant: Number(e?.grant_units), endsAt: secToMs(p?.ends_at) })
    }
  }
  return out
}

/**
 * 一次 tick 的决策：给定当前观测（giftActive）与已存状态，返回要执行的动作序列。
 * 纯函数 —— 动作由调用方执行；执行结果再由 persist 落盘。
 *
 * state: { mode: "user" | "gift" | null, saved: Record<groupId, string>, savedAt: iso }
 *   mode=null 表示插件还没介入过（首次启动/状态丢失）
 */
export function decide(observed, state, groups) {
  const cur = state?.mode ?? null
  if (observed === true && cur !== "gift") {
    // 无→有：记住各组当前值，切到礼包模式
    return { next: null, actions: groups.map((g) => ({ kind: "gift", group: g, save: (saved) => ({ version: 1, mode: "gift", saved, savedAt: new Date().toISOString() }) })) }
  }
  if (observed === false && cur === "gift") {
    // 有→无：恢复
    return { next: { version: 1, mode: "user", saved: {}, savedAt: new Date().toISOString() }, actions: groups.map((g) => ({ kind: "restore", group: g, to: state?.saved?.[g] ?? null, save: () => ({ version: 1, mode: "user", saved: {}, savedAt: new Date().toISOString() }) })) }
  }
  // 其余：无变化。observed=null（查询全失败）绝不触发动作。
  return { next: state && { ...state, version: 1 }, actions: [] }
}

/**
 * 执行一个动作并返回"落盘用的组值记录"。
 * gift 动作：先读当前值存下，再设为礼包模式；已是礼包模式则跳过设置（不覆盖用户的…——
 * 不对，已是礼包模式说明上次恢复没发生或用户手动切过，此时**仍要记录**当前值吗？
 * 记录的语义是"用户原来的配置"。若当前已经是 gift 模式而 state.mode 不是 gift
 * （比如 magpie 重启丢了状态、或用户手动设的 gift），我们没有用户原值可记，
 * 恢复时只能跳过。所以：读到的当前值若已等于礼包模式，saved 记 null（恢复时跳过）。
 */
export async function perform(action, deps) {
  const cur = await deps.getRouting(action.group)
  if (action.kind === "gift") {
    const saved = cur && cur !== deps.giftRouting ? cur : null
    if (cur !== deps.giftRouting) await deps.setRouting(action.group, deps.giftRouting)
    return { group: action.group, saved, set: deps.giftRouting, skipped: cur === deps.giftRouting }
  }
  // restore
  const to = action.to
  if (!to) return { group: action.group, saved: null, set: null, skipped: true } // 没有原值可恢复
  if (cur === to) return { group: action.group, saved: to, set: to, skipped: true }
  await deps.setRouting(action.group, to)
  return { group: action.group, saved: to, set: to, skipped: false }
}
