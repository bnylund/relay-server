import { Socket, Server, ServerOptions } from 'socket.io'
import { Server as HTTPSServer } from 'https'
import { Server as HTTPServer } from 'http'
import { AddressInfo } from 'net'
import { Express } from 'express'
import pug from 'pug'

import matches, { Base, RocketLeague, updateMatch } from './live'
import axios from 'axios'
import Logger from 'js-logger'
import { decodeToken, login } from './auth'

interface BaseConnection {
  email: string
  name: string
  id: string
  socket: Socket
  group_id: string
  type: 'OVERLAY' | 'PLUGIN' | 'CONTROLBOARD'
}

interface Overlay extends BaseConnection {
  scenes: { name: string; dataFormat: any }[]
}

interface Plugin extends BaseConnection {
  rate: number
  active: boolean
  ingame_match_guid: string // Used for failover
}

// TODO: Logger, (opt) Modular event handlers
export class WebsocketService {
  io: Server
  private connections: any[] = []

  constructor(private app: Express) {}

  attach = (srv: HTTPServer | HTTPSServer, opts?: Partial<ServerOptions>) => {
    srv.once('listening', () => {
      Logger.info(`Attached Socket.IO to port ${(<AddressInfo>srv.address()).port}`)
    })
    if (this.io) {
      this.io.attach(srv, opts)
    } else {
      this.io = new Server(srv, { pingTimeout: 3000, pingInterval: 1500, ...opts })
      this.io.on('connection', async (socket: Socket) => {
        let sockets = await this.io.of('/').adapter.sockets(new Set())
        Logger.info(`Client connected! (${socket.id}, ${sockets.size} sockets connected)`)
        try {
          this.registerListeners(socket)
        } catch (err) {
          Logger.error(`Socket [${socket.id}] threw error: ${err.message}`)
        }
      })
    }
  }

  registerListeners = (socket: Socket) => {
    socket.on('disconnect', (reason) => {
      Logger.info(`Client disconnected. (${socket.id}, ${reason})`)

      // Update overlay list
      let con = this.connections.find((x) => x.id === socket.id)
      if (con) {
        Logger.info(`${con.type === 'OVERLAY' ? 'Overlay' : 'Plugin'} disconnected. (${con.id})`)
        this.io.to('control').emit(`${con.type.toLowerCase()}:deactivated`, con.id)
        this.connections = this.connections.filter((x) => x.id !== con.id)

        if (con.type === 'PLUGIN') {
          const plugin = con as Plugin
          const newPlugin = <Plugin>this.connections.find((x: any) => x.ingame_match_guid === plugin.ingame_match_guid)
          if (newPlugin && plugin.active && plugin.group_id === newPlugin.group_id) {
            newPlugin.active = true
          }
        }
      }
    })

    socket.on('match:get', (id: string, callback: (match: Base.Match) => void) => {
      callback(matches.find((x) => x.id === id))
    })

    socket.on('match:get_all', (callback: (matches: Base.Match[]) => void) => {
      callback(matches)
    })

    socket.on('login', (type: 'OVERLAY' | 'PLUGIN' | 'CONTROLBOARD', callback: (path: string) => void) => {
      Logger.info(`Creating endpoints for ${socket.id} - ${type}`)
      this.app.get(`/login/${socket.id}`, (req, res) => {
        if (this.connections.find((x) => x.id === socket.id)) res.send({ error: 'Already logged in.' })
        else res.send(pug.compileFile(`${__dirname}/../pages/login.pug`)({ socket_id: socket.id, type }))
      })

      this.app.post(`/login/${socket.id}`, async (req, res) => {
        const { email, password, token, name, type } = req.body

        if (type !== 'CONTROLBOARD' && type !== 'OVERLAY' && type !== 'PLUGIN')
          return res.status(400).send({ error: 'Invalid type.' })

        if ((type === 'OVERLAY' || type === 'PLUGIN') && !name)
          return res.status(400).send({ error: 'No name specified.' })

        if (this.connections.find((x) => x.id === socket.id)) return res.send({ error: 'Already logged in.' })

        let user

        // Check token (if it exists), otherwise email/pass auth
        if (token) {
          try {
            user = await decodeToken(token)
          } catch (err) {
            return res.status(401).send({ error: err.message })
          }
        } else {
          if (!email || !password) return res.status(400).send({ error: 'Email or password not specified.' })

          try {
            user = await login(email, password)
          } catch (err) {
            return res.status(401).send({ error: err.message })
          }
        }

        if (!user) return res.status(500).send({ error: 'An unknown error occurred.' })

        if (type === 'CONTROLBOARD') {
          this.registerCB(socket)
          socket.join('control')
          socket.emit('logged_in')
        } else if (type === 'PLUGIN') {
          this.connections.push({
            name,
            email: user.email,
            id: socket.id,
            rate: 0,
            active: false,
            group_id: 'Unassigned',
            ingame_match_guid: '',
            type: 'PLUGIN',
          })
          this.registerPlugin(socket)
          this.io.to('control').emit('plugin:activated', socket.id, name, email)
          socket.emit('logged_in')
          socket.join(['plugin', 'Unassigned'])
        } else {
          this.connections.push({
            name,
            email: user.email,
            id: socket.id,
            group_id: 'Unassigned',
            scenes: [],
            type: 'OVERLAY',
          })
          this.registerOverlay(socket)
          socket.join(['overlay', 'Unassigned'])
          socket.emit('logged_in')
          this.io.to('control').emit('overlay:activated', socket.id, name, email)
        }
        Logger.info(`${socket.id} logged in [${name} - ${type}]`)
        return res.status(200).send({ message: 'Socket logged in.' })
      })

      callback(`/login/${socket.id}`)
    })

    this.registerTestListeners(socket)
  }

  registerOverlay = (socket: Socket) => {
    socket.on('scene:register', (name, dataFormat) => {
      const overlay = this.connections.find((x) => x.id === socket.id)
      if (!overlay) return
      overlay.scenes = overlay.scenes.filter((x) => x.name !== name)
      overlay.scenes.push({ name, dataFormat })
    })
  }

  registerPlugin = (socket: Socket) => {
    socket.on('heartbeat', (callback: () => void) => {
      callback()
    })

    socket.on('game:event', (ev: string) => {
      // incoming json game events from socketio-cpp are in string form
      let evData = JSON.parse(ev)

      const plugin = this.connections.find((x) => x.id === socket.id)
      if (!plugin) {
        // This should never happen, so clean up
        socket.disconnect(true)
        return
      }

      // If there isn't an associated match, don't do anything
      if (plugin.group_id === 'Unassigned') return

      // We send our own state events, so ignore game:update_state
      if (evData.event !== 'game:update_state') this.io.to(plugin.group_id).except('plugin').emit('game:event', evData)
      else {
        const plugin = this.connections.find((x) => x.id === socket.id)
        plugin.rate++
        setTimeout(() => {
          if (plugin) plugin.rate--
        }, 1000)
      }

      this.parseMessage(plugin, evData)
    })
  }

  registerCB = (socket: Socket) => {
    socket.on('groups:list', (callback: (groups: string[]) => void) => {
      const groups = []
      for (let i = 0; i < this.connections.length; i++) {
        if (!groups.includes(this.connections[i].group_id)) {
          groups.push(this.connections[i].group_id)
        }
      }
      callback(groups)
    })

    socket.on('match:update', (id: string, matchData: Partial<Base.Match>) => {
      const match = updateMatch(id, matchData)
      this.io.to('control').emit('match:updated', id, match)
    })

    socket.on('match:set_team', (id: string, teamnum: number, team: Partial<Base.Team>, cb: (err?: string) => void) => {
      const match = matches.find((x) => x.id === id)
      if (!match) {
        cb('Match not found.')
        return
      }
      let g = match.game ?? ({} as Base.Game)

      if (teamnum >= g.teams.length || teamnum < 0) {
        cb('Index out of bounds.')
        return
      }

      g.teams[teamnum] = { ...g.teams[teamnum], ...team }

      let winningScore = Math.ceil(match.bestOf / 2)
      match.hasWinner = false
      if (((g.teams[teamnum] ?? {}).series ?? 0) >= winningScore) {
        match.hasWinner = true
        match.winner = teamnum
      }
      match.game = g

      this.io.to('control').emit('match:team_set', id, teamnum, g.teams[teamnum])
      cb()
    })

    socket.on(
      'scene:visibility',
      (match_id: string, data: { name: string; state: boolean; transition: boolean; [key: string]: any }) => {
        if (!match_id || match_id === '') return
        this.io.to(match_id).except('plugin').emit('scene:visibility', data)
      },
    )

    socket.on('connection:list', (cb: (connections: any[]) => void) => {
      cb(this.connections)
    })

    socket.on('scene:update_data', (match_id: string, scene_name: string, data: any) => {
      if (match_id && match_id.length > 0) this.io.to(match_id).emit('scene:update_data', scene_name, data)
    })

    socket.on('scene:execute', (match_id: string, scene_name: string, name: string) => {
      if (match_id && match_id.length > 0) this.io.to(match_id).emit('scene:execute', scene_name, name)
    })

    socket.on('relay:deactivate', (id: string, callback: (err?: Error) => void) => {
      const connection = this.connections.find((x) => x.id === id)
      if (connection) {
        this.io.sockets.sockets.get(id).disconnect(true)
        callback()
        return
      }
      callback(new Error('SocketID not found.'))
    })

    socket.on('relay:assign', (sid: string, match: string, callback: (err?: Error) => void) => {
      if (!match || match === '') {
        callback(new Error('Invalid match name.'))
        return
      }
      const connection = this.connections.find((x) => x.id === sid)
      if (!connection) {
        callback(new Error('SocketID not found.'))
        return
      }
      connection.group_id = match
      this.io.sockets.sockets.get(sid).join(match)
      callback()
    })
  }

  registerTestListeners = (socket: Socket) => {
    if (process.env.NODE_ENV === 'test') {
      socket.on('relay:assign', (sid: string, match: string, callback: (err?: Error) => void) => {
        if (!match || match === '') {
          callback(new Error('Invalid match name.'))
          return
        }
        const connection = this.connections.find((x) => x.id === sid)
        if (!connection) {
          callback(new Error('SocketID not found.'))
          return
        }
        connection.group_id = match
        this.io.sockets.sockets.get(sid).join(match)
        callback()
      })

      socket.on('login', (type: string, callback: () => void) => {
        if (type === 'CONTROLBOARD') {
          socket.join('control')
          this.registerCB(socket)
        } else if (type === 'PLUGIN') {
          this.connections.push({
            name: 'TEST-RELAY',
            email: 'TEST-RELAY@nylund.us',
            id: socket.id,
            rate: 0,
            active: false,
            group_id: 'Unassigned',
            ingame_match_guid: '',
            type: 'PLUGIN',
          })
          this.io.to('control').emit('plugin:activated', socket.id, 'TEST-RELAY', 'TEST-RELAY@nylund.us')
          socket.join('plugin')
          this.registerPlugin(socket)
        } else {
          this.connections.push({
            name: 'TEST-RELAY',
            email: 'TEST-RELAY@nylund.us',
            id: socket.id,
            group_id: 'Unassigned',
            scenes: [],
            type: 'OVERLAY',
          })
          socket.join('overlay')
          Logger.info(`Overlay activated! (${'TEST-RELAY'}) [${'TEST-RELAY@nylund.us'}]`)
          this.io.to('control').emit('overlay:activated', socket.id, 'TEST-RELAY', 'TEST-RELAY@nylund.us')
          this.registerOverlay(socket)
        }

        callback()
      })
    }
  }

  // TODO: Maybe add external, modular parsers that do things when other things happen?
  parseMessage = (plugin: Plugin, json: { game: string; event: string; data: any }) => {
    if (!json.event) return
    const match = matches.find((x) => x.id === plugin.group_id)
    if (!match) return

    if (json.event === 'game:update_state') {
      let data = json.data
      if (this.connections.filter((x) => x.ingame_match_guid === data.match_guid).length === 0) {
        plugin.active = true
      }
      plugin.ingame_match_guid = data.match_guid
      if (!plugin.active) return
      let g = match.game ?? ({ teams: [] } as Base.Game)

      // Make game-specific updates
      if (json.game === 'ROCKET_LEAGUE') {
        while (g.teams.length < 2) g.teams.push({} as RocketLeague.Team) // Create defaults

        // Home team
        let allPlayers = data.players as RocketLeague.Player[]
        g.teams[0].players = Object.values(allPlayers).filter((x) => x.team === 0)
        g.teams[0].score = data.game.teams['0'].score
        g.teams[0].series ??= 0

        // Away team
        g.teams[1].score = data.game.teams['1'].score
        g.teams[1].series ??= 0
        g.teams[1].players = Object.values(allPlayers).filter((x) => x.team === 1)

        // Merge game objects
        delete data.game.teams
        delete data.players
        g = { ...g, ...data.game }
      }

      match.game = g

      // Send out update_state to keep in sync with plugin update_state
      this.io.to(plugin.group_id).except('plugin').emit('match:update_state', match)
    } else if (json.event === 'game:match_ended') {
      if (!plugin.active) return
      let g = match.game ?? ({} as Base.Game)

      // When structuring events on C++ end, we can generalize team wins
      g.hasWinner = true
      let winning_team: number = json.data.winner_team_num
      g.teams[winning_team].series += 1
      g.winner = winning_team

      match.game = g
      let winningScore = Math.ceil(match.bestOf / 2)
      if ((g.teams[winning_team].series ?? 0) >= winningScore) {
        match.hasWinner = true
        match.winner = winning_team
      }

      if (match.hasWinner) {
        // Pass the entire match in the game ended
        this.io.to(plugin.group_id).except('plugin').emit('game:ended', match, winning_team)
        this.io.to(plugin.group_id).except('plugin').emit('match:ended', match)
      } else this.io.to(plugin.group_id).except('plugin').emit('game:ended', match, winning_team)
    } else if (json.event === 'game:match_destroyed') {
      if (!plugin.active) return
      delete match.game
    }

    if (process.env.NODE_ENV === 'test') {
      this.io.emit(json.event)
    }
  }
}
