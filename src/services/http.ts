require('dotenv').config()
import { json } from 'body-parser'
import { WebsocketService } from './websocket'
import express, { Express } from 'express'
import { terminal } from 'terminal-kit'
import http from 'http'
import Logger from 'js-logger'
import fs from 'fs'
import cors from 'cors'
import bakkes from './live'
import logger from './log'
import matches from './match'

// #region Environment Setup

// Require terminal configs so they get packaged
require('terminal-kit/lib/termconfig/xterm.generic')
require('terminal-kit/lib/termconfig/xterm-256color.generic')
require('terminal-kit/lib/termconfig/xterm-truecolor.generic')

var stdin = process.stdin
if (stdin.isTTY) stdin.setRawMode(true)
else console.log('TTY not attached. Keystrokes may not work as expected.')
stdin.resume()
stdin.setEncoding('utf8')

const getColor = (level: string) => {
  return level === 'INFO' ? '\x1b[34m' : level === 'WARN' ? '\x1b[33m' : '\x1b[91m'
}

Logger.useDefaults({
  defaultLevel: Logger.INFO,
  formatter: (messages, context) => {
    messages.unshift(`[${getColor(context.level.name.toUpperCase())}\x1b[1m${context.level.name.toUpperCase()}\x1b[0m]`)
    messages.unshift(`\x1b[90m[${new Date().toLocaleString()}]\x1b[0m`)

    // Remove color coding from logfile
    fs.appendFileSync('log.txt', messages.join(' ').replace(/\u001b\[.*?m/g, '') + '\n')
  },
})

if (!process.env.NODE_ENV) {
  Logger.warn('no NODE_ENV specified, defaulting to production.')
  process.env.NODE_ENV = 'production'
}

global.updatePending = false

// #endregion

Logger.info('+-+-+-+-+-+ STARTING SERVER +-+-+-+-+-+')

// #region Express Setup

const app: Express = express()
app.use(json({ limit: '10mb' }), (err, req, res, next) => {
  if (err) {
    return res.status(400).send({ error: 'Error parsing JSON.' })
  } else {
    next()
  }
})

app.use(require('../middleware/db').database)

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'DELETE', 'PATCH'],
  }),
)

app.use((err, req, res, next) => {
  if (err) {
    res.status(500).send({ error: err.message })
  }
})

app.get('/', (req, res) => {
  return res.status(200).send({})
})

// #endregion

// #region Websocket Setup

const PORT = process.argv.length >= 3 ? Number(process.argv[2]) : process.env.PORT ? Number(process.env.PORT) : 80
export const httpServer = http.createServer(app).listen(PORT, () => {
  Logger.info(`HTTP Server started on port ${PORT}`)

  app.emit('listening')
})

export const websocket = new WebsocketService(app)
websocket.attach(httpServer)

export const bakkesWS = bakkes(websocket)

// #endregion

const vlog = logger(websocket, bakkesWS)

let quit = false

stdin.on('data', async (key: Buffer) => {
  if (key.toString() === '\u0003') {
    await stop()
  } else {
    // Put other key commands here
    if (key.toString() === 'q') {
      if (!quit) {
        console.log("Press 'q' again to quit.")
        quit = true
      } else await stop()
    } else if (key.toString() === 'v') {
      console.log(JSON.stringify(matches[0], undefined, 2))
    } else if (key.toString() === 'h') {
      // Print commands
      console.log(
        '\n                       \u2563 Commands \u2560\n\n    v - View Match Data   q - Close Server   h - Show Commands  \n',
      )
    }
  }
})

// #region Process Signals

const stop = async (signal?: any) => {
  try {
    await new Promise((resolve, reject) => {
      bakkesWS.close(1001, 'Server closing.')

      websocket.io.close((err) => {
        if (err) reject(err)
        else resolve(undefined)
      })
    })
  } catch (err) {
    Logger.error('Error while closing')
    vlog.close()
    process.exit(1)
  }
  Logger.info('Exiting.')
  vlog.close()
  process.exit(0)
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)

// #endregion

export default app
