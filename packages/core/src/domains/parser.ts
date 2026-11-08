/** A deliberately small, deterministic Boolean expression parser. */
export type Expr =
  | { kind: 'const'; value: boolean }
  | { kind: 'var'; name: string }
  | { kind: 'not'; child: Expr }
  | { kind: 'and' | 'or' | 'xor'; left: Expr; right: Expr }

const NORMALIZE: Record<string, string> = {
  '¬': '!', '∧': '&', '·': '&', '∗': '*', '∨': '|', '⊕': '^',
}

function lex(source: string): string[] {
  if (!source.trim()) throw new Error('表达式不能为空')
  if (source.length > 256) throw new Error('表达式过长（最多 256 个字符）')
  const tokens: string[] = []
  for (const original of source) {
    if (/\s/.test(original)) continue
    const c = NORMALIZE[original] ?? original.toUpperCase()
    if (!/^[A-Z01()!~'&*.+|^]$/.test(c)) {
      throw new Error(`不支持的字符：${original}`)
    }
    tokens.push(c)
  }
  return tokens
}

export function parseExpression(source: string): Expr {
  const tokens = lex(source)
  let cursor = 0
  const peek = () => tokens[cursor]
  const take = () => tokens[cursor++]

  function atom(): Expr {
    if (peek() === '(') {
      take()
      const inner = orExpr()
      if (take() !== ')') throw new Error('括号不匹配')
      return inner
    }
    const t = peek()
    if (t === undefined) throw new Error('表达式不完整')
    if (t === '0' || t === '1') {
      take()
      return { kind: 'const', value: t === '1' }
    }
    if (/^[A-Z]$/.test(t)) {
      take()
      return { kind: 'var', name: t }
    }
    throw new Error(`此处需要变量、常量或左括号，实际为：${t}`)
  }

  function notExpr(): Expr {
    if (peek() === '!' || peek() === '~') {
      take()
      return { kind: 'not', child: notExpr() }
    }
    let node = atom()
    while (peek() === "'") {
      take()
      node = { kind: 'not', child: node }
    }
    return node
  }

  function andExpr(): Expr {
    let node = notExpr()
    while (true) {
      const token = peek()
      if (token === '*' || token === '.' || token === '&') {
        take()
      } else if (token && !['(', '!', '~', '0', '1'].includes(token) && !/^[A-Z]$/.test(token)) {
        break
      } else if (!token) {
        break
      }
      // An adjacent variable, constant, parenthesis or prefix negation implies AND.
      node = { kind: 'and', left: node, right: notExpr() }
    }
    return node
  }

  function xorExpr(): Expr {
    let node = andExpr()
    while (peek() === '^') {
      take()
      node = { kind: 'xor', left: node, right: andExpr() }
    }
    return node
  }

  function orExpr(): Expr {
    let node = xorExpr()
    while (peek() === '+' || peek() === '|') {
      take()
      node = { kind: 'or', left: node, right: xorExpr() }
    }
    return node
  }

  const output = orExpr()
  if (cursor !== tokens.length) throw new Error(`无法解析字符：${peek()}`)
  return output
}

export function variables(node: Expr): string[] {
  const found = new Set<string>()
  const walk = (current: Expr): void => {
    switch (current.kind) {
      case 'var': found.add(current.name); break
      case 'not': walk(current.child); break
      case 'and': case 'or': case 'xor':
        walk(current.left); walk(current.right); break
    }
  }
  walk(node)
  return [...found].sort()
}

export function evaluate(node: Expr, env: Record<string, boolean>): boolean {
  switch (node.kind) {
    case 'const': return node.value
    case 'var':
      if (!(node.name in env)) throw new Error(`缺少变量赋值：${node.name}`)
      return env[node.name]
    case 'not': return !evaluate(node.child, env)
    case 'and': return evaluate(node.left, env) && evaluate(node.right, env)
    case 'or': return evaluate(node.left, env) || evaluate(node.right, env)
    case 'xor': return evaluate(node.left, env) !== evaluate(node.right, env)
  }
}

export function assignment(names: string[], index: number): Record<string, boolean> {
  const env: Record<string, boolean> = {}
  for (let i = 0; i < names.length; i++) {
    env[names[i]] = Boolean((index >> (names.length - 1 - i)) & 1)
  }
  return env
}

export function truthTable(source: string, maxVariables = 8) {
  const expr = parseExpression(source)
  const names = variables(expr)
  if (names.length > maxVariables) throw new Error(`最多支持 ${maxVariables} 个变量的真值表`)
  const rows = Array.from({ length: 2 ** names.length }, (_, index) => {
    const values = assignment(names, index)
    return { input: names.map(n => Number(values[n])).join(''), output: Number(evaluate(expr, values)) }
  })
  return { expression: source, variables: names, rows }
}

export function checkEquivalence(left: string, right: string) {
  const a = parseExpression(left)
  const b = parseExpression(right)
  const names = [...new Set([...variables(a), ...variables(b)])].sort()
  if (names.length > 8) throw new Error('等价性验证最多支持 8 个变量')
  for (let n = 0; n < 2 ** names.length; n++) {
    const env = assignment(names, n)
    const aValue = evaluate(a, env)
    const bValue = evaluate(b, env)
    if (aValue !== bValue) {
      return { equivalent: false, variables: names, counterexample: Object.fromEntries(names.map(k => [k, Number(env[k])])), leftValue: Number(aValue), rightValue: Number(bValue) }
    }
  }
  return { equivalent: true, variables: names, counterexample: null, leftValue: null, rightValue: null }
}
