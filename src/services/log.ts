import { WebsocketService } from './websocket'
import { networkInterfaces } from 'os'
import { terminal } from 'terminal-kit'
import Logger from 'js-logger'

let dots = 0

const printScreen = async (wss: WebsocketService) => {
  process.stdout.clearLine(0)
  process.stdout.cursorTo(0)

  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    if (!name.startsWith('en') && !name.startsWith('eth') && !name.startsWith('wl')) continue
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
      const familyV4Value = typeof net.family === 'string' ? 'IPv4' : 4
      if (net.family === familyV4Value && !net.internal) {
        terminal.bold.green(`\u2794 ${name}: ${net.address}  `)
      }
    }
  }

  terminal.bold.green('\u2b24 Clients: 0  ')
  terminal.bold.yellow(`\u2b24 Rocket League Connecting${'.'.repeat(dots++)}`)
  if (dots > 4) dots = 1
}

const defaults = {
  close: () => {},
  refresh: () => {},
}

export default (wss: WebsocketService) => {
  if (!process.stdout.clearLine || !process.stdout.cursorTo) {
    console.log('Terminal features limited, not showing GUI.')
    return defaults
  }

  // #region Update log functions

  const logs = {
    c: console.log,
    info: Logger.info,
    warn: Logger.warn,
    error: Logger.error,
    debug: Logger.debug,
    trace: Logger.trace,
  }

  console.log = (message?: any, ...optionalParams: any[]): void => {
    process.stdout.clearLine(0)
    process.stdout.cursorTo(0)
    logs.c(message, ...optionalParams)
    printScreen(wss)
  }

  Logger.info = (...x: any[]) => {
    process.stdout.clearLine(0)
    process.stdout.cursorTo(0)
    logs.info(...x)
    printScreen(wss)
  }

  Logger.warn = (...x: any[]) => {
    process.stdout.clearLine(0)
    process.stdout.cursorTo(0)
    logs.warn(...x)
    printScreen(wss)
  }

  Logger.error = (...x: any[]) => {
    process.stdout.clearLine(0)
    process.stdout.cursorTo(0)
    logs.error(...x)
    printScreen(wss)
  }

  Logger.debug = (...x: any[]) => {
    process.stdout.clearLine(0)
    process.stdout.cursorTo(0)
    logs.debug(...x)
    printScreen(wss)
  }

  Logger.trace = (...x: any[]) => {
    process.stdout.clearLine(0)
    process.stdout.cursorTo(0)
    logs.trace(...x)
    printScreen(wss)
  }

  // #endregion

  const refresh = setInterval(async () => {
    await printScreen(wss)
  }, 1000)

  return {
    close: () => {
      clearInterval(refresh)
    },
    refresh: async () => {
      await printScreen(wss)
    },
  }
}
