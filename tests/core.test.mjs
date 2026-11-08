import test from 'node:test'
import assert from 'node:assert/strict'
import { grayToBcd, truthTable, simplifyExpression, checkEquivalence } from '../dist/logic-core/index.js'

test('Gray 1101 → binary 1001 → decimal 9 → BCD 1001', () => {
  assert.deepEqual(grayToBcd('1101'), { gray: '1101', binary: '1001', decimal: '9', bcd: '1001' })
})
test('Gray leading zeroes and multi-digit decimal', () => {
  assert.equal(grayToBcd('0100').decimal, '7')
  assert.equal(grayToBcd('11110').decimal, '20')
  assert.equal(grayToBcd('11110').bcd, '0010 0000')
  assert.throws(() => grayToBcd('1020'), /Gray/)
})
test('Truth table of A\u0027B+AC has correct row ordering and outputs', () => {
  const result = truthTable("A'B+AC")
  assert.deepEqual(result.variables, ['A', 'B', 'C'])
  assert.deepEqual(result.rows.map(r => r.output), [0, 0, 1, 1, 0, 1, 0, 1])
})
test('Boolean parser precedence, postfix apostrophe and XOR', () => {
  assert.equal(checkEquivalence('A+B&C', 'A+(B&C)').equivalent, true)
  assert.equal(checkEquivalence("(A+B)'", "A'B'").equivalent, true)
  assert.equal(checkEquivalence('A^B', "A'B+AB'").equivalent, true)
  assert.throws(() => truthTable('A++B'))
})
test('SOP minimization and explicit equivalence', () => {
  const result = simplifyExpression("A'B+AB")
  assert.equal(result.minimized, 'B')
  assert.equal(result.verified, true)
  assert.deepEqual(result.minterms, [1, 3])
  assert.equal(checkEquivalence("A'B+AB", 'B').equivalent, true)
  const mismatch = checkEquivalence('A+B', 'A&B')
  assert.equal(mismatch.equivalent, false)
  assert.ok(mismatch.counterexample)
})
test("SOP edge cases and don't-cares", () => {
  assert.equal(simplifyExpression('0').minimized, '0')
  assert.equal(simplifyExpression('1').minimized, '1')
  assert.equal(simplifyExpression("A+A'").minimized, '1')
  assert.equal(simplifyExpression('A&B', [1]).verified, true)
  assert.throws(() => simplifyExpression('A', [1]), /重叠/)
  assert.throws(() => simplifyExpression('A', [2]), /索引/)
})
test('Randomized exhaustive equivalence checks for exact SOP minimization', () => {
  let seed = 1001
  const randomBit = () => { seed = (1664525 * seed + 1013904223) >>> 0; return (seed >>> 16) & 1 }
  for (let i = 0; i < 250; i++) {
    const terms = []
    for (let row = 0; row < 16; row++) {
      if (!randomBit()) continue
      const bits = row.toString(2).padStart(4, '0')
      terms.push(bits.split('').map((bit, index) => bit === '1' ? 'ABCD'[index] : `${'ABCD'[index]}'`).join(''))
    }
    const expression = terms.join(' + ') || '0'
    const simplified = simplifyExpression(expression)
    assert.equal(simplified.verified, true)
    assert.equal(checkEquivalence(expression, simplified.minimized).equivalent, true)
  }
})

test('Exact minimum SOP term/literal cost on all 256 three-variable functions', () => {
  const names = 'ABC'
  const cost = expression => {
    if (expression === '0') return [0, 0]
    const terms = expression.split(' + ')
    return [terms.length, terms.reduce((total, term) => total + (term.match(/[A-Z]/g) ?? []).length, 0)]
  }
  const patterns = []
  for (const a of '-01') for (const b of '-01') for (const c of '-01') {
    const pattern = a + b + c
    let mask = 0
    for (let i = 0; i < 8; i++) {
      const bits = i.toString(2).padStart(3, '0')
      if ([...pattern].every((v, index) => v === '-' || v === bits[index])) mask |= 1 << i
    }
    patterns.push({ mask, literals: [...pattern].filter(c => c !== '-').length })
  }
  for (let truth = 0; truth < 256; truth++) {
    const terms = []
    for (let i = 0; i < 8; i++) {
      if (!(truth & (1 << i))) continue
      terms.push(i.toString(2).padStart(3, '0').split('').map((bit, j) => bit === '1' ? names[j] : `${names[j]}'`).join(''))
    }
    const actual = simplifyExpression(terms.join(' + ') || '0')
    const allowed = patterns.filter(p => (p.mask & ~truth) === 0 && p.mask !== 0)
    const dp = Array.from({ length: 256 }, () => [Infinity, Infinity])
    dp[0] = [0, 0]
    for (let mask = 0; mask < 256; mask++) {
      for (const p of allowed) {
        const next = mask | p.mask
        const candidate = [dp[mask][0] + 1, dp[mask][1] + p.literals]
        if (candidate[0] < dp[next][0] || (candidate[0] === dp[next][0] && candidate[1] < dp[next][1])) dp[next] = candidate
      }
    }
    assert.deepEqual(cost(actual.minimized), dp[truth], `truth mask=${truth}`)
  }
})
