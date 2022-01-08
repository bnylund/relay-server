# Relay

[![Node.js CI](https://github.com/mn-rocket-league/relay-server/actions/workflows/node.js.yml/badge.svg?branch=main)](https://github.com/mn-rocket-league/relay-server/actions/workflows/node.js.yml)

Here you will find the source code used to provide game data to clients. For data transportation it uses [socket.io 4.x](https://socket.io/docs/v4/).

## Logging in

To get access to all required functions in the socket server, you must first log in. You can do this by sending a login event after connecting:

```typescript
socket.emit('login', token, 'CONTROLBOARD' /* or */ 'PLUGIN' /* or */ 'OVERLAY', (status: string, info: { name: string; version: string; author: string }) => {
  // Do stuff here
})
```

## Relay Listeners

| Listener            | Receivers    | arg1               | arg2            | arg3          | Description                                                               |
|---------------------|--------------|--------------------|-----------------|---------------|---------------------------------------------------------------------------|
| match:updated       | CONTROLBOARD | match_id: string   | match: Match    |               | Fires when the current match gets updated                                |
| match:ended         | CONTROLBOARD | match: Match       |                 |               | Fires when the current match (aka series) finishes. Same match room only |
| match:team_set      | CONTROLBOARD | match_id: string   | teamnum: number | match: Match  | Fires when either the home team or away team gets set                    |
| overlay:activated   | CONTROLBOARD | id: string         | name: string    | email: string | Fires when an overlay gets activated                                     |
| overlay:deactivated | CONTROLBOARD | id: string         |                 |               | Fires when an overlay gets deactivated                                   |
| plugin:activated    | CONTROLBOARD | id: string         | name: string    | email: string | Fires when a plugin gets activated                                       |
| plugin:deactivated  | CONTROLBOARD | id: string         |                 |               | Fires when a plugin gets deactivated                                      |
| game:event          | ALL, -PLUGIN | eventData: any     |                 |               | Fires when a game event is received. Same match room only                |
| game:ended          | ALL, -PLUGIN | match: Match       | teamnum: 0 \| 1 |               | Fires when a game finishes. Same match room only                         |
| scene:visibility    | OVERLAY      | data: SceneData    |                 |               | Fires when a scene's visibility gets changed. Same match room only       |
| scene:update_data   | OVERLAY      | scene_name: string | data: any       |               | Fires when scene data gets updated. Same match room only                 |

## Relay Commands
| Command            | Senders      | arg1                                 | arg2                             | arg3                            | arg4                            | Description                            |
|--------------------|--------------|--------------------------------------|----------------------------------|---------------------------------|---------------------------------|----------------------------------------|
| match:update       | CONTROLBOARD | match_id: string                     | data: Partial<Match>             |                                 |                                 | Updates the current match              |
| match:set_team     | CONTROLBOARD | match_id: string                     | teamnum: number                  | data: Partial<Team>             | callback: (err?: Error) => void | Sets either the home team or away team |
| overlay:list       | CONTROLBOARD | callback: (list: Overlay[]) => void  |                                  |                                 |                                 | Lists all connected overlays           |
| plugin:list        | CONTROLBOARD | callback: (list: Plugin[]) => void   |                                  |                                 |                                 | Lists all connected plugins            |
| scene:visibility   | CONTROLBOARD | match_id: string                     | data: SceneData                  |                                 |                                 | Updates scene visibility               |
| scene:update_data  | CONTROLBOARD | match_id: string                     | scene_name: string               | data: any                       |                                 | Updates scene data                     |
| relay:assign       | CONTROLBOARD | socket_id: string                    | type: 'PLUGIN' \| 'OVERLAY'      | match_id: string                | callback: (err?: Error) => void | Assigns a plugin/overlay to a match    |
| relay:deactivate   | CONTROLBOARD | id: string                           | type: 'PLUGIN' \| 'OVERLAY       | callback: (err?: Error) => void |                                 | Deactivates the specified client       |
| game:event         | PLUGIN       | data: string                         |                                  |                                 |                                 | Sends a game event for parsing         |
| match:get          | ALL          | match_id: string                     | callback: (match: Match) => void |                                 |                                 | Gets current match by ID               |
| match:get_all      | ALL          | callback: (matches: Match[]) => void |                                  |                                 |                                 | Gets all running matches               |
| match:list         | ALL          | callback: (matches: string[]) => void|                                  |                                 |                                 | Gets all running match names           |