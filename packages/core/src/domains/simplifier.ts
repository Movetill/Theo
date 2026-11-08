import { assignment, evaluate, parseExpression, variables } from './parser.js'

type Implicant = { pattern: string }
const literalCount = (pattern: string) => [...pattern].filter(c => c !== '-').length
const maskMatches = (pattern: string, value: number) => {
  const bits = value.toString(2).padStart(pattern.length, '0')
  return [...pattern].every((char, idx) => char === '-' || char === bits[idx])
}
const patternOf = (value: number, width: number) => value.toString(2).padStart(width, '0')

function combine(a: string, b: string): string | null {
  let count = 0
  let result = ''
  for (let k = 0; k < a.length; k++) {
    if (a[k] === b[k]) { result += a[k]; continue }
    if (a[k] === '-' || b[k] === '-') return null
    result += '-'
    count++
  }
  return count === 1 ? result : null
}

function primesOf(universe: number[], width: number): Implicant[] {
  let current = [...new Set(universe.map(x => patternOf(x, width)))].sort()
  const primes = new Set<string>()
  while (current.length) {
    const combined = new Set<string>()
    const used = new Set<string>()
    for (let i = 0; i < current.length; i++) {
      for (let j = i + 1; j < current.length; j++) {
        const merged = combine(current[i], current[j])
        if (merged !== null) {
          used.add(current[i]); used.add(current[j]); combined.add(merged)
        }
      }
    }
    for (const pattern of current) if (!used.has(pattern)) primes.add(pattern)
    current = [...combined].sort()
  }
  return [...primes].map(pattern => ({ pattern }))
}

function solveCover(minterms: number[], primes: Implicant[]): string[] {
  if (!minterms.length) return []
  const coverSets = primes.map(p => minterms.filter(m => maskMatches(p.pattern, m)))
  const selectable = primes.map((p, i) => ({ pattern: p.pattern, cover: coverSets[i], literals: literalCount(p.pattern) }))
    .filter(p => p.cover.length > 0)
    .sort((a, b) => a.literals - b.literals || a.pattern.localeCompare(b.pattern))

  const selected = new Set<number>()
  for (const minterm of minterms) {
    const matches = selectable.flatMap((p, i) => p.cover.includes(minterm) ? [i] : [])
    if (matches.length === 1) selected.add(matches[0])
  }
  const already = new Set([...selected].flatMap(i => selectable[i].cover))
  const remaining = minterms.filter(m => !already.has(m))
  const memo = new Map<string, number>()
  let best: number[] | null = null
  const measure = (indexes: number[]) => [indexes.length, indexes.reduce((acc, i) => acc + selectable[i].literals, 0)]
  const improve = (candidate: number[]) => {
    const set = [...new Set([...selected, ...candidate])].sort((a, b) => a - b)
    if (!best || measure(set)[0] < measure(best)[0] ||
      (measure(set)[0] === measure(best)[0] && measure(set)[1] < measure(best)[1])) best = set
  }
  function dfs(uncovered: number[], chosen: number[]): void {
    if (!uncovered.length) { improve(chosen); return }
    if (best && chosen.length + selected.size > best.length) return
    const state = [...uncovered].sort((a, b) => a - b).join(',')
    const prior = memo.get(state)
    if (prior !== undefined && prior < chosen.length) return
    memo.set(state, chosen.length)
    // Choose the hardest remaining minterm first.
    const target = [...uncovered].sort((a, b) =>
      selectable.filter(p => p.cover.includes(a)).length - selectable.filter(p => p.cover.includes(b)).length)[0]
    const options = selectable.map((p, i) => ({ ...p, i }))
      .filter(p => !selected.has(p.i) && !chosen.includes(p.i) && p.cover.includes(target))
      .sort((a, b) => b.cover.length - a.cover.length || a.literals - b.literals)
    for (const p of options) {
      dfs(uncovered.filter(m => !p.cover.includes(m)), [...chosen, p.i])
    }
  }
  dfs(remaining, [])
  const solution = best as number[] | null
  if (!solution) throw new Error('无法覆盖全部最小项')
  return solution.map((i: number) => selectable[i].pattern)
}

function formatTerm(pattern: string, names: string[]): string {
  return [...pattern].flatMap((char, i) => char === '-' ? [] : [char === '1' ? names[i] : `${names[i]}'`]).join('') || '1'
}

/** Exact two-level SOP minimization for <=5 variables. Don't-cares may change freely. */
export function simplifyExpression(source: string, dontCares: number[] = []) {
  const original = parseExpression(source)
  const names = variables(original)
  if (names.length > 5) throw new Error('精确 SOP 化简最多支持 5 个变量')
  const size = 2 ** names.length
  if (names.length === 0) {
    if (dontCares.length) throw new Error('常量表达式不接受无关项')
    return { original: source, minimized: evaluate(original, {}) ? '1' : '0', variables: names, minterms: evaluate(original, {}) ? [0] : [], dontCares, verified: true }
  }
  if (dontCares.some(x => !Number.isSafeInteger(x) || x < 0 || x >= size)) {
    throw new Error(`无关项索引必须在 0–${size - 1} 之间`)
  }
  if (new Set(dontCares).size !== dontCares.length) throw new Error('无关项索引不能重复')
  const minterms: number[] = []
  for (let i = 0; i < size; i++) {
    if (evaluate(original, assignment(names, i))) minterms.push(i)
  }
  if (dontCares.some(x => minterms.includes(x))) throw new Error('无关项不能与原表达式的最小项重叠')
  const cover = solveCover(minterms, primesOf([...minterms, ...dontCares], names.length))
  const minimized = cover.length ? cover.map(p => formatTerm(p, names)).join(' + ') : '0'
  const result = parseExpression(minimized)
  const allVerified = Array.from({ length: size }, (_, i) => i)
    .filter(i => !dontCares.includes(i))
    .every(i => evaluate(original, assignment(names, i)) === evaluate(result, assignment(names, i)))
  if (!allVerified) throw new Error('内部错误：化简后与原式不等价')
  return { original: source, minimized, variables: names, minterms, dontCares, verified: allVerified }
}
