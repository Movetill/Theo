export interface SignalRef { nodeId: string; port: string }
export interface PortSpec { id: string; direction: 'input' | 'output'; width: number; signed?: boolean }
export interface ClockDomainSpec { id: string; edge: 'rising' }
interface WidthParams { width: number; signed?: boolean }
interface Node<K extends string, P, B> { id: string; kind: K; params: P; inputBindings: B }
type Unary = { a: SignalRef }
type Binary = { a: SignalRef; b: SignalRef }
export type NodeSpec =
  | Node<'CONST', WidthParams & { bits: string }, Record<string, never>>
  | Node<'NOT', WidthParams, Unary>
  | Node<'AND' | 'OR' | 'XOR' | 'ADD' | 'EQ', WidthParams, Binary>
  | Node<'MUX', WidthParams, { sel: SignalRef; whenFalse: SignalRef; whenTrue: SignalRef }>
  | Node<'SLICE', { inputWidth: number; lsb: number; width: number }, { value: SignalRef }>
  | Node<'CONCAT', { highWidth: number; lowWidth: number }, { high: SignalRef; low: SignalRef }>
  | Node<'REGISTER', WidthParams & {
      clockDomain: string; resetMode: 'synchronous'; resetActive: 'high'; resetValue: string; initialValue: string
    }, { d: SignalRef; reset: SignalRef }>

export interface DigitalDesign {
  schemaVersion: '0.3.0'
  id: string
  name: string
  revision: number
  ports: PortSpec[]
  clocks: ClockDomainSpec[]
  nodes: NodeSpec[]
  outputBindings: Record<string, SignalRef>
  metadata?: { description?: string; teachingTopic?: string }
}
