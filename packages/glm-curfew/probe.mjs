// 端口探测：本服务的单例判断。响应带 x-glm-curfew: 1 才算"已有本服务在跑"——
// 别的程序占了端口时不算（让 Bun.serve 抛原始错误）。
// 不从 index.mjs 导出：宿主会把模块导出的每个函数都当插件函数调（check.mjs 约定）。
export async function alreadyServing(port, timeoutMs = 1500) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`, { signal: AbortSignal.timeout(timeoutMs) })
    return res.headers.get("x-glm-curfew") === "1"
  } catch {
    return false
  }
}
