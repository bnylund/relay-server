import { Socket, Server, ServerOptions } from 'socket.io'
import { Server as HTTPServer } from 'http'
import { AddressInfo } from 'net'
import { Express } from 'express'

import matches, { Base, RocketLeague, updateMatch } from './match'
import Logger from 'js-logger'

import config from '../../package.json'

interface BaseConnection {
  readonly id: string
  readonly type: 'OVERLAY' | 'PLUGIN' | 'CONTROLBOARD'
  readonly email: string
}

interface GroupedConnection extends BaseConnection {
  group_id: string
  readonly name: string
}

interface Overlay extends GroupedConnection {
  scenes: { name: string; dataFormat: any; data: any; buttons: string[] }[]
}

interface Plugin extends GroupedConnection {
  rate: number
  input: number
  active: boolean
  ingame_match_guid: string // Used for failover (not tested yet)
}

export class WebsocketService {
  io: Server
  private connections: any[] = []

  constructor(private app: Express) {
    setInterval(() => {
      if (this.io && this.io.sockets && this.io.sockets.sockets) {
        this.io.sockets.sockets.forEach((x) => {
          x.emit('heartbeat')
        })
      }
    }, 100)
  }

  relayEvent = (data: object) => {
    this.io.to('LOCALHOST').except('plugin').emit('game:event', data)
  }

  attach = (srv: HTTPServer, opts?: Partial<ServerOptions>) => {
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
        // Logger.info(
        //   `${
        //     con.type === 'OVERLAY' ? 'Overlay' : con.type === 'CONTROLBOARD' ? 'Control Board' : 'Plugin'
        //   } disconnected. (${con.id})`,
        // )
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

    // socket.on('match:get', (callback: (match: Base.Match) => void) => {
    //   callback(matches.find((x) => x.group_id === 'LOCALHOST'))
    // })

    socket.on('match:get', (id: string, callback: (match: Base.Match) => void) => {
      callback(matches.find((x) => x.group_id === id))
    })

    socket.on('match:get_all', (callback: (matches: Base.Match[]) => void) => {
      callback(matches)
    })

    socket.on('group:listen', (group: string) => {
      socket.join(['overlay', group])
    })

    socket.on('groups:list', (callback: (groups: string[]) => void) => {
      const groups = ['LOCALHOST']
      for (let i = 0; i < this.connections.length; i++) {
        if (!groups.includes(this.connections[i].group_id) && this.connections[i].group_id !== '') {
          groups.push(this.connections[i].group_id)
        }
      }
      callback(groups)
    })

    // no need for callback, this will emit logged_in like the regular website auth does
    socket.on('login', async (type: 'OVERLAY' | 'PLUGIN' | 'CONTROLBOARD', name?: string) => {
      if (type !== 'CONTROLBOARD' && type !== 'OVERLAY' && type !== 'PLUGIN') return

      if ((type === 'OVERLAY' || type === 'PLUGIN') && !name) return

      if (this.connections.find((x) => x.id === socket.id)) return

      if (type === 'CONTROLBOARD') {
        this.registerCB(socket)
        socket.join('control')
        socket.emit('logged_in')
        this.connections.push({
          id: socket.id,
          type: 'CONTROLBOARD',
          email: 'null@rocketcast.io',
        })
      } else if (type === 'PLUGIN') {
        this.connections.push({
          name,
          email: 'null@rocketcast.io',
          id: socket.id,
          input: 0,
          rate: 0,
          active: false,
          group_id: 'LOCALHOST',
          ingame_match_guid: '',
          type: 'PLUGIN',
        })
        this.registerPlugin(socket)
        this.io.to('control').emit('plugin:activated', socket.id, name, 'null@rocketcast.io')
        socket.emit('logged_in')
        socket.join(['plugin', 'LOCALHOST'])
      } else {
        this.connections.push({
          name,
          email: 'null@rocketcast.io',
          id: socket.id,
          group_id: 'LOCALHOST',
          scenes: [],
          type: 'OVERLAY',
        })
        this.registerOverlay(socket)
        socket.join(['overlay', 'LOCALHOST'])
        socket.emit('logged_in')
        this.io.to('control').emit('overlay:activated', socket.id, name, 'null@rocketcast.io')
      }
      Logger.info(`${socket.id} logged in [DIRECT, ${name} - ${type}]`)
    })

    socket.on('info', (callback: (info: any) => void) => {
      callback({
        version: config.version,
        name: config.name,
        author: config.author,
      })
    })

    socket.emit('info', {
      version: config.version,
      name: config.name,
      author: config.author,
    })

    this.registerTestListeners(socket)
  }

  registerOverlay = (socket: Socket) => {
    socket.on('scene:register', (name, dataFormat, buttons) => {
      const overlay = this.connections.find((x) => x.id === socket.id)
      if (!overlay) return
      overlay.scenes = overlay.scenes.filter((x) => x.name !== name)
      overlay.scenes.push({ name, dataFormat, buttons })
    })
  }

  registerPlugin = (socket: Socket) => {
    socket.on('heartbeat', (callback: () => void) => {
      callback()
    })

    socket.on('game event', (ev: string) => {
      // incoming json game events from socketio-cpp are in string form
      let evData = JSON.parse(ev)

      const plugin = this.connections.find((x) => x.id === socket.id)
      if (!plugin) {
        // This should never happen, so clean up
        socket.disconnect(true)
        return
      }

      // If there isn't an associated group, don't do anything
      if (plugin.group_id === '') return

      if (!matches.find((x) => x.group_id === plugin.group_id)) {
        const match = {
          group_id: plugin.group_id,
          winner: -1,
          hasWinner: false,
          teamSize: 3,
          bestOf: 5,
          teams: [],
        }
        console.log(`Creating new match for group ${plugin.group_id}`)
        matches.push(match)
      }

      plugin.input++

      // We send our own state events, so ignore game:update_state
      if (evData.event !== 'game:update_state') {
        this.io.to(plugin.group_id).except('plugin').emit('game:event', evData)
      } else {
        const plugin = this.connections.find((x) => x.id === socket.id)
        plugin.rate++
        setTimeout(() => {
          // ...why are you booing me? im right! [insert meme here]
          if (plugin) plugin.rate--
        }, 1000)
      }

      this.parseMessage(plugin, evData)
    })
  }

  registerCB = (socket: Socket) => {
    socket.on('match:update', (id: string, matchData: Partial<Base.Match>) => {
      const match = updateMatch(id, matchData)
      this.io.to('control').emit('match:updated', id, match)
    })

    socket.on('match:set_team', (id: string, teamnum: number, team: Partial<Base.Team>, cb: (err?: string) => void) => {
      const match = matches.find((x) => x.group_id === id)
      if (!match) {
        cb('Match not found.')
        return
      }

      if (teamnum >= match.teams.length || teamnum < 0) {
        cb('Index out of bounds.')
        return
      }

      match.teams[teamnum] = { ...match.teams[teamnum], ...team }

      let winningScore = Math.ceil(match.bestOf / 2)
      match.hasWinner = false
      if (((match.teams[teamnum] ?? {}).score ?? 0) >= winningScore) {
        match.hasWinner = true
        match.winner = teamnum
      }

      this.io.to('control').emit('match:updated', id, match)
      this.io.to('control').emit('match:team_set', id, teamnum, match.teams[teamnum])
      cb()
    })

    socket.on(
      'scene:visibility',
      (group_id: string, data: { name: string; state: boolean; transition: boolean; [key: string]: any }) => {
        if (!group_id || group_id === '') return
        this.io.to(group_id).except('plugin').emit('scene:visibility', data)
      },
    )

    socket.on('connection:list', (cb: (connections: any[]) => void) => {
      cb(this.connections)
    })

    socket.on('scene:update_data', (group_id: string, scene_name: string, data: any) => {
      if (group_id && group_id.length > 0) {
        this.io.to(group_id).emit('scene:update_data', scene_name, data)
        this.io.to('control').emit('scene:update_data', group_id, scene_name, data)

        // Save "current" data for each overlay in the group
        this.connections.forEach((x) => {
          if (x.type === 'OVERLAY' && x.group_id === group_id) {
            const scene = x.scenes.find((sn) => sn.name === scene_name)
            if (scene) scene.data = data
          }
        })
      }
    })

    socket.on('scene:execute', (group_id: string, scene_name: string, name: string) => {
      if (group_id && group_id.length > 0) this.io.to(group_id).emit('scene:execute', scene_name, name)
    })

    socket.on('relay:deactivate', (id: string, callback: (err?: string) => void) => {
      const connection = this.connections.find((x) => x.id === id)
      if (connection && connection.type !== 'CONTROLBOARD') {
        this.io.sockets.sockets.get(id).disconnect(true)
        callback()
        return
      }
      callback('SocketID not found.')
    })

    socket.on('relay:assign', (sid: string, group: string, callback: (err?: string) => void) => {
      if (!group || group === '') {
        callback('Invalid match name.')
        return
      }
      const connection = this.connections.find((x) => x.id === sid)
      if (!connection) {
        callback('SocketID not found.')
        return
      }

      if (connection.type === 'PLUGIN') {
        // If no match is present, create new
        if (!matches.find((x) => x.group_id === group)) {
          const match = {
            group_id: group,
            winner: -1,
            hasWinner: false,
            teamSize: 3,
            bestOf: 5,
            teams: [],
          }
          console.log(`Creating new match for group ${group}`)
          matches.push(match)
        }
      }

      connection.group_id = group
      this.io.sockets.sockets.get(sid).join(group)
      callback()
    })

    // UPDATE FUNCTIONALITY SCRAPPED: Not needed for Rocketcast. It clones the latest version every launch.
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
            input: 0,
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
    const match = matches.find((x) => x.group_id === plugin.group_id)
    if (!match) return

    if (json.event === 'game:update_state') {
      let data = json.data
      plugin.ingame_match_guid = data.match_guid

      // Game-specific updates
      if (json.game === 'ROCKET_LEAGUE') {
        while (match.teams.length < 2) {
          match.teams.push({
            score: 0,
          } as RocketLeague.Team) // Create defaults
        }
      }

      // match.game = g

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

      updateMatch(plugin.group_id, match)

      if (match.hasWinner) {
        // Pass the entire match in the game ended
        this.io.to(plugin.group_id).except('plugin').emit('game:ended', match, winning_team)
        this.io.to(plugin.group_id).except('plugin').emit('match:ended', match)
      } else this.io.to(plugin.group_id).except('plugin').emit('game:ended', match, winning_team)
    }

    if (process.env.NODE_ENV === 'test') {
      this.io.emit(json.event)
    }
  }
}
