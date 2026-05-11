// Compact terminal logger with consistent visual rhythm.
// Modeled on the simulation-agent's `log.ts`, simplified.

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  signal: '\x1b[38;2;92;184;178m', // teal
  amber: '\x1b[38;2;212;184;106m',
  red: '\x1b[38;2;196;91;91m',
  green: '\x1b[38;2;126;196;155m',
  text2: '\x1b[38;2;160;157;152m',
}

export function header(title: string, subtitle?: string): void {
  console.log()
  console.log(`  ${COLORS.bold}${title}${COLORS.reset}`)
  if (subtitle) console.log(`  ${COLORS.text2}${subtitle}${COLORS.reset}`)
  console.log()
}

export function detail(key: string, value: string): void {
  console.log(
    `    ${COLORS.text2}${key.padEnd(11)}${COLORS.reset}${value}`,
  )
}

export function status(message: string): void {
  console.log(`  ${COLORS.signal}◇${COLORS.reset} ${message}`)
}

export function ok(message: string): void {
  console.log(`  ${COLORS.green}✓${COLORS.reset} ${message}`)
}

export function fail(message: string): void {
  console.log(`  ${COLORS.red}⊘${COLORS.reset} ${message}`)
}

export function warn(message: string): void {
  console.log(`  ${COLORS.amber}!${COLORS.reset} ${message}`)
}

export function info(message: string): void {
  console.log(`  ${COLORS.text2}${message}${COLORS.reset}`)
}
