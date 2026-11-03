import { expect, test } from "bun:test"
import * as mod from "./zcode-gift-window.gateway.js"
import { checkStrategies, order } from "../../scripts/middleware.mjs"

checkStrategies(import.meta.dir, mod)

test("gives the two routings, and no hook it doesn't use", () => {
  expect(Object.keys(mod.strategies).sort()).toEqual(["drain-then-sink", "gift-first"])
  expect(mod.onRequest).toBeUndefined()
  expect(mod.onEvent).toBeUndefined()
  expect(mod.onResponse).toBeUndefined()
  expect(mod.onUsage).toBeUndefined()
})

test("every answer is an order of the seats, whatever they hold", () => {
  for (const name of Object.keys(mod.strategies)) {
    for (const prefix of ["zcode", "", "minimax"]) {
      for (let n = 2; n < 9; n++) {
        const seats = Array.from({ length: n }, (_, i) => ({
          key: i % 3 === 0 ? `zcode@acct${i}` : `prov${i}`,
          account: i % 2 === 0, known: i % 3 !== 0, used: (i * 37) % 101,
          soon: [], pace: i % 5, weight: (i % 3) + 1, resting: i === 4, tokens: i * 1000,
        }))
        expect(order(mod, name, "group/auto-glm-5-3-flash", seats, { prefix }).failed).toBeUndefined()
      }
    }
  }
})

test("a seat whose key is not a string cannot break it", () => {
  const got = order(mod, "gift-first", "pool", [
    { key: null, known: true, used: 0 },
    { key: 42, known: true, used: 1 },
    { key: "zcode", known: true, used: 2 },
  ])
  expect(got.failed).toBeUndefined()
  expect(got.order).toEqual([2, 0, 1])
})
