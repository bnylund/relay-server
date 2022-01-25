import { Server as HTTPServer } from 'http'
import { Socket, Server } from 'socket.io'
import { success } from 'cli-msg'
import { Express } from 'express'
import matches, { Base, RocketLeague, updateMatch } from './live'
import pug from 'pug'

interface BaseConnection {
  email: string
  name: string
  id: string
  socket: Socket
  group_id: string
  type: 'OVERLAY' | 'PLUGIN'
}

interface Overlay extends BaseConnection {
  scenes: { name: string; dataFormat: any }[]
}

interface Plugin extends BaseConnection {
  rate: number
  active: boolean
  ingame_match_guid: string // Used for failover
}

export interface Websocket {
  authenticated: string[]
  connections: any[]
  io: Server
}

const websocket = {
  authenticated: [],
  connections: [],
  io: undefined,
} as Websocket

/*
  DO NOT RUN THIS VERSION (THIS GIT COMMIT) ON PROD, ALL TOKENS WILL VALIDATE. LOCAL ONLY UNTIL AUTH IS DONE! (like pretty please, don't run on prod)
*/
export function initialize(http: HTTPServer, app: Express) {
  const io = new Server(http, {
    pingTimeout: 3000,
    pingInterval: 1500,
  })
  io.on('connection', async (socket: Socket) => {
    let sockets = await io.of('/').adapter.sockets(new Set())
    console.log('Client connected! (' + sockets.size + ')')
    registerListeners(socket, app)
  })
  websocket.io = io

  success.wb('Socket.IO hooked!')
}

function registerListeners(socket: Socket, app: Express) {
  socket.on('disconnect', (reason) => {
    websocket.authenticated = websocket.authenticated.filter((x) => x !== socket.id)
    console.log('Client disconnected. (' + reason + ')')

    // Update overlay list
    let con = websocket.connections.find((x) => x.id === socket.id)
    if (con) {
      console.log(`${con.type === 'OVERLAY' ? 'Overlay' : 'Plugin'} disconnected. (${con.id})`)
      websocket.io.to('control').emit(`${con.type.toLowerCase()}:deactivated`, con.id)
      websocket.connections = websocket.connections.filter((x) => x.id !== con.id)

      if (con.type === 'PLUGIN') {
        const plugin = con as Plugin
        const newPlugin = <Plugin>(
          websocket.connections.find((x: any) => x.ingame_match_guid === plugin.ingame_match_guid)
        )
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

  app.get(`/login/${socket.id}`, (req, res) => {
    res.send(pug.compileFile(`${__dirname}/../pages/login.pug`)({ socket_id: socket.id }))
  })

  app.post(`/login/${socket.id}`, (req, res) => {
    const { email, password, type } = req.body
    /* Send a POST /login to broadcast-backend. If successful, continue with adding
       the current socket to the authenticated list, then register listeners.
    */
  })

  socket.on(
    'login',
    async (
      token: string,
      type: 'CONTROLBOARD' | 'PLUGIN' | 'OVERLAY',
      callback: (status: string, info: { name: string; version: string; author: string }) => void,
    ) => {
      const inf = {
        name: require('../../package.json').name,
        version: require('../../package.json').version,
        author: require('../../package.json').author,
      }

      let name = 'tmp_name'

      try {
        const user = { email: 'I_HOPE_THIS_ISNT_PROD@nylund.us ' } // await decodeToken(token)
        if (user) {
          if (type === 'OVERLAY') {
            websocket.connections.push({
              name,
              id: socket.id,
              socket,
              email: user.email,
              group_id: 'Unassigned',
              scenes: [],
              type: 'OVERLAY',
            })
            socket.join('overlay')
            console.log(`Overlay activated! (${name}) [${user.email}]`)
            websocket.io.to('control').emit('overlay:activated', socket.id, name, user.email)
            registerTestListeners(socket)
            registerOverlayListeners(socket)
          } else if (type === 'CONTROLBOARD') {
            socket.join('control')
            registerPrivateListeners(socket)
          } else if (type === 'PLUGIN') {
            websocket.connections.push({
              name,
              id: socket.id,
              email: user.email,
              rate: 0,
              active: false,
              socket,
              group_id: 'Unassigned',
              ingame_match_guid: '',
              type: 'PLUGIN',
            })
            websocket.io.to('control').emit('plugin:activated', socket.id, name, user.email)
            socket.join('plugin')
            registerPluginListeners(socket)
            registerTestListeners(socket)
          }
          callback('good', inf)
          return
        }
      } catch (ex) {}
      callback('fail', inf)
    },
  )
}

function registerOverlayListeners(socket: Socket) {
  socket.on('scene:register', (name, dataFormat) => {
    const overlay = websocket.connections.find((x) => x.id === socket.id)
    if (!overlay) return
    overlay.scenes = overlay.scenes.filter((x) => x.name !== name)
    overlay.scenes.push({ name, dataFormat })
  })
}

function registerPluginListeners(socket: Socket) {
  socket.on('heartbeat', (callback: () => void) => {
    callback()
  })

  socket.on('game:event', (ev: string) => {
    // incoming json game events from socketio-cpp are in string form
    let evData = JSON.parse(ev)

    const plugin = websocket.connections.find((x) => x.id === socket.id)
    if (!plugin) {
      // This should never happen, so clean up
      socket.disconnect(true)
      return
    }

    // If there isn't an associated match, don't do anything
    if (plugin.group_id === 'Unassigned') return

    // We send our own state events, so ignore game:update_state
    if (evData.event !== 'game:update_state')
      websocket.io.to(plugin.group_id).except('plugin').emit('game:event', evData)
    else {
      const plugin = websocket.connections.find((x) => x.id === socket.id)
      plugin.rate++
      setTimeout(() => {
        if (plugin) plugin.rate--
      }, 1000)
    }

    parseMessage(plugin, evData)
  })
}

function registerPrivateListeners(socket: Socket) {
  console.log(`Client logged in! (${socket.id})`)

  socket.on('groups:list', (callback: (groups: string[]) => void) => {
    const groups = []
    for (let i = 0; i < websocket.connections.length; i++) {
      if (!groups.includes(websocket.connections[i].group_id)) {
        groups.push(websocket.connections[i].group_id)
      }
    }
    callback(groups)
  })

  socket.on('match:update', (id: string, matchData: Partial<Base.Match>) => {
    const match = updateMatch(id, matchData)
    websocket.io.to('control').emit('match:updated', id, match)
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

    websocket.io.to('control').emit('match:team_set', id, teamnum, g.teams[teamnum])
    cb()
  })

  socket.on(
    'scene:visibility',
    (match_id: string, data: { name: string; state: boolean; transition: boolean; [key: string]: any }) => {
      if (match_id === 'Unassigned') return
      websocket.io.to(match_id).except('plugin').emit('scene:visibility', data)
    },
  )

  socket.on('connection:list', (cb: (connections: any[]) => void) => {
    cb(websocket.connections)
  })

  socket.on('scene:update_data', (match_id: string, scene_name: string, data: any) => {
    if (match_id && match_id.length > 0) websocket.io.to(match_id).emit('scene:update_data', scene_name, data)
  })

  socket.on('relay:deactivate', (id: string, callback: (err?: Error) => void) => {
    const connection = websocket.connections.find((x) => x.id === id)
    if (connection && connection.id === socket.id) {
      socket.disconnect(true)
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
    const connection = websocket.connections.find((x) => x.id === sid)
    if (!connection) {
      callback(new Error('SocketID not found.'))
      return
    }
    connection.group_id = match
    connection.socket.join(match)
    callback()
  })
}

function registerTestListeners(socket: Socket) {
  if (process.env.RELAY_ENV === 'test') {
    socket.on('relay:assign', (sid: string, match: string, callback: (err?: Error) => void) => {
      if (!match || match === '') {
        callback(new Error('Invalid match name.'))
        return
      }
      const connection = websocket.connections.find((x) => x.id === sid)
      if (!connection) {
        callback(new Error('SocketID not found.'))
        return
      }
      connection.group_id = match
      connection.socket.join(match)
      callback()
    })
  }
}

function parseMessage(plugin: Plugin, json: { game: string; event: string; data: any }) {
  if (!json.event) return
  const match = matches.find((x) => x.id === plugin.group_id)
  if (!match) return

  if (json.event === 'game:update_state') {
    let data = json.data
    if (websocket.connections.filter((x) => x.ingame_match_guid === data.match_guid).length === 0) {
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
    websocket.io.to(plugin.group_id).except('plugin').emit('match:update_state', match)
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
      websocket.io.to(plugin.group_id).except('plugin').emit('game:ended', match, winning_team)
      websocket.io.to(plugin.group_id).except('plugin').emit('match:ended', match)
    } else websocket.io.to(plugin.group_id).except('plugin').emit('game:ended', match, winning_team)
  } else if (json.event === 'game:match_destroyed') {
    if (!plugin.active) return
    delete match.game
  }

  if (process.env.RELAY_ENV === 'test') {
    websocket.io.emit(json.event)
  }
}

export default websocket
