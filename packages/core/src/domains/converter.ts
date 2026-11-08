/** Binary-reflected Gray -> unsigned binary -> decimal -> packed 8421 BCD groups. */
export function grayToBcd(gray: string) {
  if (!/^[01]{1,64}$/.test(gray)) throw new Error('Gray 码必须是 1–64 位的 0/1 字符串')
  let previous = 0
  let binary = ''
  for (const character of gray) {
    previous ^= Number(character)
    binary += String(previous)
  }
  const decimal = BigInt(`0b${binary}`).toString(10)
  const bcd = [...decimal].map(char => Number(char).toString(2).padStart(4, '0')).join(' ')
  return { gray, binary, decimal, bcd }
}
