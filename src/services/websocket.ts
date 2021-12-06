import { Server as HTTPServer } from 'http'
import { Socket, Server } from 'socket.io'
import { success } from 'cli-msg'
import matches, { Base, RocketLeague, updateMatch } from './live'

interface Overlay {
  email: string
  name: string
  id: string
  match_id: string // Assigned match
}

interface Plugin extends Overlay {
  rate: number
  active: boolean
  ingame_match_guid: string // Used for failover
}

export interface Websocket {
  authenticated: string[]
  overlays: Overlay[]
  plugins: Plugin[]
  io: Server
}

const websocket = {
  authenticated: [],
  overlays: [],
  plugins: [],
  io: undefined,
} as Websocket

/*
  DO NOT RUN THIS VERSION (THIS GIT COMMIT) ON PROD, ALL TOKENS WILL VALIDATE. LOCAL ONLY UNTIL AUTH IS DONE! (like pretty please, don't run on prod)
*/
/*

  TODO:
    - Multiple named matches running at the same time.
      = In the control board, we can create a Match with 2 teams, then assign
        overlays and plugins to the match
      = By default, overlays won't receive any data until we give it a match

*/
export function initialize(http: HTTPServer) {
  const io = new Server(http, {
    pingTimeout: 3000,
    pingInterval: 1500,
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
      const newPlugin = websocket.plugins.find((x) => x.ingame_match_guid === plugin.ingame_match_guid)
      if (newPlugin && plugin.active && plugin.match_id === newPlugin.match_id) {
        newPlugin.active = true
      }
    }
  })

  socket.on('match:get', (id: string, callback: (match: Base.Match) => void) => {
    callback(matches.find((x) => x.id === id))
  })

  socket.on('match:get_all', (callback: (matches: Base.Match[]) => void) => {
    callback(matches)
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
            websocket.overlays.push({ name, id: socket.id, email: user.email, match_id: '' })
            socket.join('overlay')
            console.log(`Overlay activated! (${name}) [${user.email}]`)
            websocket.io.to('control').emit('overlay:activated', websocket.overlays)
            registerTestListeners(socket, 'OVERLAY')
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
              match_id: '',
              ingame_match_guid: '',
            })
            websocket.io.to('control').emit('plugin:activated', websocket.plugins)
            socket.join('plugin')
            registerPluginListeners(socket)
            registerTestListeners(socket, 'PLUGIN')
          }
          callback('good', inf)
          return
        }
      } catch (ex) {}
      callback('fail', inf)
    },
  )
}

export function registerPluginListeners(socket: Socket) {
  socket.on('heartbeat', (callback: () => void) => {
    callback()
  })

  socket.on('game:event', (ev: string) => {
    // incoming json game events from socketio-cpp are in string form
    let evData = JSON.parse(ev)

    const plugin = websocket.plugins.find((x) => x.id === socket.id)
    if (!plugin) {
      // This should never happen, so clean up
      socket.disconnect(true)
      return
    }

    // We send our own state events, so ignore game:update_state
    if (evData.event !== 'game:update_state')
      websocket.io.to(plugin.match_id).except('plugin').emit('game:event', evData)
    else {
      const plugin = websocket.plugins.find((x) => x.id === socket.id)
      plugin.rate++
      setTimeout(() => {
        if (plugin) plugin.rate--
      }, 1000)
    }

    //websocket.io.to('control').emit('plugin:heartbeat')

    parseMessage(plugin, evData)
  })
}

export function registerPrivateListeners(socket: Socket) {
  console.log(`Client logged in! (${socket.id})`)
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

  socket.on('overlay:show_scene', (match_id: string, data: any) => {
    websocket.io.to(match_id).except('plugin').emit('scene:show', data)
  })

  socket.on('overlay:hide_scene', (match_id: string, data: any) => {
    websocket.io.to(match_id).except('plugin').emit('scene:hide', data)
  })

  socket.on('overlay:deactivate', (id: string) => {
    const overlay = websocket.overlays.find((x) => x.id === id)
    if (overlay && overlay.id === socket.id) {
      socket.disconnect(true)
    }
  })

  socket.on('overlay:list', (cb: (overlays: Overlay[]) => void) => {
    cb(websocket.overlays)
  })

  socket.on('relay:assign', (sid: string, type: 'PLUGIN' | 'OVERLAY', match: string, callback: () => void) => {
    if (socket.id === sid) {
      if (type === 'PLUGIN') {
        const plugin = websocket.plugins.find((x) => x.id === socket.id)
        if (!plugin) return
        plugin.match_id = match
      } else if (type === 'OVERLAY') {
        const overlay = websocket.overlays.find((x) => x.id === socket.id)
        if (!overlay) return
        overlay.match_id = match
      }
      socket.join(match)
      callback()
    }
  })
}

function registerTestListeners(socket: Socket, type: 'PLUGIN' | 'OVERLAY') {
  if (process.env.RELAY_ENV === 'test') {
    socket.on('relay:assign', (sid: string, match: string, callback: () => void) => {
      if (socket.id === sid) {
        if (type === 'PLUGIN') {
          const plugin = websocket.plugins.find((x) => x.id === socket.id)
          if (!plugin) return
          plugin.match_id = match
        } else if (type === 'OVERLAY') {
          const overlay = websocket.overlays.find((x) => x.id === socket.id)
          if (!overlay) return
          overlay.match_id = match
        }
        socket.join(match)
        callback()
      }
    })
  }
}

function parseMessage(plugin: Plugin, json: { game: string; event: string; data: any }) {
  if (!json.event) return
  const match = matches.find((x) => x.id === plugin.match_id)
  if (!match) return

  if (json.event === 'game:update_state') {
    let data = json.data
    if (websocket.plugins.filter((x) => x.ingame_match_guid === data.match_guid).length === 0) {
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
    websocket.io.to(plugin.match_id).except('plugin').emit('match:update_state', match)
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
      websocket.io.to(plugin.match_id).except('plugin').emit('game:ended', match, winning_team)
      websocket.io.to(plugin.match_id).except('plugin').emit('match:ended', match)
    } else websocket.io.to(plugin.match_id).except('plugin').emit('game:ended', match, winning_team)
  } else if (json.event === 'game:match_destroyed') {
    if (!plugin.active) return
    delete match.game
  }

  if (process.env.RELAY_ENV === 'test') {
    websocket.io.emit(json.event)
  }
}

export default websocket
