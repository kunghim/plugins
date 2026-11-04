// 子进程封装：调 magpie CLI。分开成模块以便测试注入。
import { spawn } from "node:child_process"

/** 跑一个命令，stdout/stderr 收集为字符串；非零退出抛错。超时默认 15s。 */
export function spawnFile(file, args, log = () => {}, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(file, args, { stdio: ["ignore", "pipe", "pipe"] })
    } catch (e) {
      reject(e)
      return
    }
    const out = []
    const err = []
    const timer = setTimeout(() => {
      child.kill("SIGKILL")
      reject(new Error(`timeout after ${timeoutMs}ms: ${file} ${args.join(" ")}`))
    }, timeoutMs)
    child.stdout.on("data", (d) => out.push(d))
    child.stderr.on("data", (d) => err.push(d))
    child.on("error", (e) => {
      clearTimeout(timer)
      reject(e)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      const so = Buffer.concat(out).toString("utf8")
      const se = Buffer.concat(err).toString("utf8")
      if (code === 0) {
        resolve(so)
      } else {
        const msg = (se || so).trim().split("\n").slice(-2).join(" | ")
        log(`cli exit ${code}: ${file} ${args.join(" ")} → ${msg.slice(0, 200)}`)
        reject(new Error(`exit ${code}: ${msg.slice(0, 300)}`))
      }
    })
  })
}
