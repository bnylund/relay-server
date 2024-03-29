import { WebsocketService } from './websocket'
import { networkInterfaces } from 'os'
import { terminal } from 'terminal-kit'
import Logger from 'js-logger'
import ReconnectingWebSocket from 'reconnecting-websocket'

let dots = 0

const printScreen = async (wss: WebsocketService, bakkesWS: ReconnectingWebSocket) => {
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

  terminal.bold.green(`\u2b24 Clients: ${wss.io.engine.clientsCount}  `)

  if (bakkesWS.readyState === bakkesWS.CLOSING)
    terminal.bold.yellow(`\u2b24 Rocket League Disconnecting${'.'.repeat(dots++)}`)
  else if (bakkesWS.readyState === bakkesWS.CONNECTING || bakkesWS.readyState === bakkesWS.CLOSED)
    terminal.bold.yellow(`\u2b24 Rocket League Connecting${'.'.repeat(dots++)}`)
  else terminal.bold.yellow(`\u2b24 Rocket League Connected`)

  if (dots > 4) dots = 1
}

const defaults = {
  close: () => {},
  refresh: () => {},
}

export default (wss: WebsocketService, bakkesWS: ReconnectingWebSocket) => {
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
    printScreen(wss, bakkesWS)
  }

  Logger.info = (...x: any[]) => {
    process.stdout.clearLine(0)
    process.stdout.cursorTo(0)
    logs.info(...x)
    printScreen(wss, bakkesWS)
  }

  Logger.warn = (...x: any[]) => {
    process.stdout.clearLine(0)
    process.stdout.cursorTo(0)
    logs.warn(...x)
    printScreen(wss, bakkesWS)
  }

  Logger.error = (...x: any[]) => {
    process.stdout.clearLine(0)
    process.stdout.cursorTo(0)
    logs.error(...x)
    printScreen(wss, bakkesWS)
  }

  Logger.debug = (...x: any[]) => {
    process.stdout.clearLine(0)
    process.stdout.cursorTo(0)
    logs.debug(...x)
    printScreen(wss, bakkesWS)
  }

  Logger.trace = (...x: any[]) => {
    process.stdout.clearLine(0)
    process.stdout.cursorTo(0)
    logs.trace(...x)
    printScreen(wss, bakkesWS)
  }

  // #endregion

  const refresh = setInterval(async () => {
    await printScreen(wss, bakkesWS)
  }, 1000)

  return {
    close: () => {
      clearInterval(refresh)
    },
    refresh: async () => {
      await printScreen(wss, bakkesWS)
    },
  }
}
