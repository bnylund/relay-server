import { Server as HTTPServer } from 'http'
import { success } from 'cli-msg'
import { Socket, Server } from 'socket.io'
import match, { Base, RocketLeague, updateMatch } from './live'

interface Overlay {
  email: string
  name: string
  id: string
}

interface Plugin extends Overlay {
  rate: number
  active: boolean
  match_guid: string // pull from update_state
}

export interface Websocket {
  authenticated: string[]
  overlays: Overlay[]
  plugins: Plugin[]
  updates: any[]
  io: Server
}

const websocket = {
  authenticated: [],
  overlays: [],
  plugins: [],
  updates: [],
  io: undefined,
} as Websocket

/*
  DO NOT RUN THIS VERSION (THIS GIT COMMIT) ON PROD, ALL TOKENS WILL VALIDATE. LOCAL ONLY UNTIL AUTH IS DONE! (like pretty please, don't run on prod)
*/
export function initialize(http: HTTPServer) {
  const io = new Server(http, {
    pingTimeout: 3000,
    pingInterval: 5000,
  })
  io.on('connection', async (socket: Socket) => {
    let sockets = await io.of('/').adapter.sockets(new Set())
    console.log('Client connected! (' + sockets.size + ')')
    registerListeners(socket)
  })
  websocket.io = io
  success.wb('Socket.IO hooked!')
}

export function registerListeners(socket: Socket) {
  socket.on('disconnect', (reason) => {
    websocket.authenticated = websocket.authenticated.filter((x) => x !== socket.id)
    console.log('Client disconnected. (' + reason + ')')

    // Update overlay list
    const overlay = websocket.overlays.find((x) => x.id === socket.id)
    if (overlay) {
      console.log('Overlay disconnected. (' + overlay.name + ')')
      websocket.io.to('overlay').to('control').emit('overlay:deactivated', overlay.id)
      websocket.overlays = websocket.overlays.filter((x) => x.id !== overlay.id)
    }

    // Update plugin list
    const plugin = websocket.plugins.find((x) => x.id === socket.id)
    if (plugin) {
      console.log('Plugin disconnected. (' + plugin.name + ')')
      websocket.io.to('plugin').to('control').emit('plugin:deactivate', plugin.id)
      websocket.plugins = websocket.plugins.filter((x) => x.id !== plugin.id)

      // Assign new active plugin for match_guid, if applicable
      const newPlugin = websocket.plugins.find((x) => x.match_guid === plugin.match_guid)
      if (newPlugin && plugin.active) {
        newPlugin.active = true
      }
    }
  })

  socket.on('game:get', (callback: (game: Base.Game, err?: Error) => void) => {
    if (match.game) {
      callback(match.game)
      return
    }
    callback(null, new Error('Game not found.'))
  })

  socket.on('match:get', (callback: (match: Base.Match) => void) => {
    callback(match)
  })

  // Auth through website instead?
  // like imagine, plugin opens up default browser (w/ socket id), and web browser handles auth (email, pass, plugin display name, etc)
  // 😳👉👈 much cool
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

      // Overlay, Controlboard, and Plugin will all use HTTP api to get a token using email/pass.
      // Token will be the same JWT
      try {
        const user = { email: 'I_HOPE_THIS_ISNT_PROD@nylund.us ' } // await decodeToken(token)
        if (user) {
          if (type === 'OVERLAY') {
            websocket.overlays.push({ name, id: socket.id, email: user.email })
            socket.join('overlay')
            console.log(`Overlay activated! (${name}) [${user.email}]`)
            websocket.io.to('control').emit('overlay:activated', websocket.overlays)
          } else if (type === 'CONTROLBOARD') {
            socket.join('control')
            registerPrivateListeners(socket)
          } else if (type === 'PLUGIN') {
            websocket.plugins.push({
              name,
              id: socket.id,
              email: user.email,
              rate: 0,
              active: false,
              match_guid: '',
            })
            websocket.io.to('control').emit('plugin:activated', websocket.plugins)
            socket.join('plugin')
            registerPluginListeners(socket, user.email)
          }
          callback('good', inf)
          return
        }
      } catch (ex) {}
      callback('fail', inf)
    },
  )
}

export function registerPluginListeners(socket: Socket, email: string) {
  socket.on('heartbeat', (callback: () => void) => {
    callback()
  })

  socket.on('game:event', (ev: string) => {
    // incoming json game events from socketio-cpp are in string form
    let evData = JSON.parse(ev)

    // We send our own state events, so ignore game:update_state
    if (evData.event !== 'game:update_state') websocket.io.to('overlay').to('control').emit('game:event', evData)
    else {
      const plugin = websocket.plugins.find((x) => x.id === socket.id)
      plugin.rate++
      setTimeout(() => {
        plugin.rate--
      }, 1000)
    }

    //websocket.io.to('control').emit('plugin:heartbeat')

    parseMessage(socket.id, evData)
  })
}

export function registerPrivateListeners(socket: Socket) {
  console.log(`Client logged in! (${socket.id})`)
  socket.on('match:update', (matchData: Partial<Base.Match>) => {
    updateMatch(matchData)
    websocket.io.to('overlay').to('control').emit('match:updated', match)
  })

  socket.on('match:set_team', (teamnum: number, team: Partial<Base.Team>, cb: (err?: string) => void) => {
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

    websocket.io.to('overlay').to('control').emit('match:team_set', teamnum, g.teams[teamnum])
    cb()
  })

  socket.on('overlay:show_scene', (data: any) => {
    websocket.io.to('overlay').emit('scene:show', data)
  })

  socket.on('overlay:hide_scene', (data: any) => {
    websocket.io.to('overlay').emit('scene:hide', data)
  })

  socket.on('overlay:deactivate', (email: string, name: string) => {
    const overlay = websocket.overlays.find((x) => x.name === name && x.email === email)
    if (overlay && overlay.id === socket.id) {
      socket.disconnect(true)
    }
  })

  socket.on('overlay:list', (cb: (overlays: Overlay[]) => void) => {
    cb(websocket.overlays)
  })
}

function parseMessage(id: string, json: { game: string; event: string; data: any }) {
  const plugin = websocket.plugins.find((x) => x.id === id)
  if (!json.event) return

  if (json.event === 'game:update_state') {
    let data = json.data
    if (websocket.plugins.filter((x) => x.match_guid === data.match_guid).length === 0) {
      plugin.active = true
    }
    plugin.match_guid = data.match_guid
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
      websocket.io.to('overlay').to('control').emit('game:ended', match, winning_team)
      websocket.io.to('overlay').to('control').emit('match:ended', match)
    } else websocket.io.to('overlay').to('control').emit('game:ended', match, winning_team)
  } else if (json.event === 'game:match_destroyed') {
    if (!plugin.active) return
    delete match.game
  }

  if (process.env.RELAY_ENV === 'test') {
    websocket.io.emit(json.event)
  }
}

export default websocket
