/**
 * 1) Connect to Rocket League
 * 2) On message, parse event to update series score
 * 3) Relay message to all connected overlays
 */
import Logger from 'js-logger'
import WebSocket from 'reconnecting-websocket'
import atob from 'atob'
import WS from 'ws'
import matches from './match'
import { v4 } from 'uuid'

import { WebsocketService } from './websocket'

let urls = ['ws://host.docker.internal:49122', 'ws://localhost:49122']
let idx = 0

export default (wss: WebsocketService) => {
  if (process.env.RL_HOSTS && process.env.RL_HOSTS.length > 3) {
    urls = process.env.RL_HOSTS.split(',')
  }

  // Try different hosts each time.
  const ws = new WebSocket(() => urls[idx++ % urls.length], [], {
    WebSocket: WS,
    maxReconnectionDelay: 5000,
  })

  ws.addEventListener('open', () => {
    Logger.info('Connected to Rocket League')
  })

  ws.addEventListener('message', (message: MessageEvent<any>) => {
    let msg = message.data
    if (msg.substr(0, 1) !== '{') {
      msg = atob(message.data)
    }

    try {
      msg = JSON.parse(msg)
    } catch (err) {}

    // Parse (not tested)
    parseLegacyMessage(wss, msg)

    // Relay
    wss.relayEvent(msg)
  })

  return ws
}

export const parseLegacyMessage = (wss: WebsocketService, message: { game?: string; event: string; data: any }) => {
  if (!message.event) return
  const match = matches[0]
  if (!match) return

  // Update series scores on match end
  if (message.event === 'game:match_ended') {
    let winning_team: number = message.data.winner_team_num
    match.teams[winning_team].score += 1

    let winningScore = Math.ceil(match.bestOf / 2)
    if ((match.teams[winning_team].score ?? 0) >= winningScore) {
      match.hasWinner = true
      match.winner = winning_team
    }

    matches[0] = match

    if (match.hasWinner) {
      // Pass the entire match in the game ended
      wss.io.to('LOCALHOST').except('plugin').emit('game:ended', match, winning_team)
      wss.io.to('LOCALHOST').except('plugin').emit('match:ended', match)
    } else wss.io.to('LOCALHOST').except('plugin').emit('game:ended', match, winning_team)
  } else if (message.event === 'game:match_created') {
    // Initialize teams on match create (if not done so already)
    if (!message.game || message.game === 'ROCKET_LEAGUE') {
      for (let i = match.teams.length; i < 2; i++)
        match.teams.push({
          score: 0,
          info: {
            name: `${i === 0 ? 'Blue Team' : 'Orange Team'}`,
            avatar: 'https://www.dropbox.com/s/vr7lbsauae31am6/rl-logo.png?dl=1',
          },
          _id: v4(),
          createdAt: new Date(),
        })
    }
  }
}
