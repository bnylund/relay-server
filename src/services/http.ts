require('dotenv').config()
import { json } from 'body-parser'
import { WebsocketService } from './websocket'
import express, { Express } from 'express'
import http from 'http'
import https from 'https'
import Logger from 'js-logger'
import fs from 'fs'
import cors from 'cors'

process.stdin.resume()

Logger.useDefaults({
  defaultLevel: Logger.INFO,
  formatter: (messages, context) => {
    messages.unshift(`[${context.level.name.toUpperCase()}]`)
    messages.unshift(`[${new Date().toLocaleString()}]`)
    fs.appendFileSync('log.txt', messages.join(' ') + '\n')
  },
})

if (!process.env.NODE_ENV) {
  Logger.warn('no NODE_ENV specified, defaulting to production.')
  process.env.NODE_ENV = 'production'
}

Logger.info('+-+-+-+-+-+ STARTING SERVER +-+-+-+-+-+')

global.updatePending = false

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

const PORT = process.argv.length >= 3 ? Number(process.argv[2]) : 80
export const httpServer = http.createServer(app).listen(PORT, () => {
  Logger.info(`HTTP Server started on port ${PORT}`)

  app.emit('listening')
})

export const websocket = new WebsocketService(app)
websocket.attach(httpServer)

process.on('SIGINT', async () => {
  try {
    await new Promise((resolve, reject) => {
      websocket.io.close((err) => {
        if (err) reject(err)
        else resolve(undefined)
      })
    })
  } catch (err) {
    Logger.error('Error while closing')
    process.exit(1)
  }
  Logger.info('Exiting.')
  process.exit(0)
})

export default app
