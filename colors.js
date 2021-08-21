// color escape codes
const colors = {
  reset: "\033[0m",
  fgRed: "\033[31m",
  fgYellow: "\033[33m",
  fgGreen: "\033[32m",
  fgBlue: "\033[34m",
  error: str => `${colors.fgRed}${str}${colors.reset}`,
  warn: str => `${colors.fgYellow}${str}${colors.reset}`,
  success: str => `${colors.fgGreen}${str}${colors.reset}`,
  info: str => `${colors.fgBlue}${str}${colors.reset}`,
}

module.exports = colors