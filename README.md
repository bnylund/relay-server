# Relay

[![Node.js CI](https://github.com/bnylund/relay-server/actions/workflows/node.js.yml/badge.svg?branch=main)](https://github.com/bnylund/relay-server/actions/workflows/node.js.yml)

Here you will find the source code used to provide game data to clients. For data transportation it uses [socket.io 4.x](https://socket.io/docs/v4/).

## Logging in

To get access to all required functions in the socket server, you must first log in. You can do this by sending a login event after connecting:

```typescript
socket.emit('login', token, 'CONTROLBOARD' /* or */ 'PLUGIN' /* or */ 'OVERLAY', (status: string, info: { name: string; version: string; author: string }) => {
  // Do stuff here
})
```

# Match 

### match:get - Gets current match
```typescript
socket.emit('match:get', (match: Match) => {
  // Do stuff here
})
```

### match:update - Updates the current match
```typescript
socket.emit('match:update', matchData as Partial<Match>)
```

### match:set_team - Sets either the home team or away team
```typescript
socket.emit('match:set_team', 0 /* or */ 1, teamData as Partial<Team>, (err?: Error) => {
  // Do stuff here
})
```

### match:updated - Fires when the current match gets updated
```typescript
socket.on('match:updated', (match: Match) => {
  // Do stuff here
})
```

### match:ended - Fires when the the current match (or series) finishes
```typescript
socket.on('match:ended', (match: Match) => {
  // Do stuff here
})
```

### match:team_set - Fires when either the home team or away team gets set
```typescript
socket.on('match:team_set', (teamnum: number, match: Match) => {
  // Do stuff here
})
```

# Game

### game:get - Gets current game
```typescript
socket.emit('game:get', (game: Game) => {
  // Do stuff here
})
```

### game:event - Sends a game event in for parsing (PLUGIN ONLY)
```typescript
socket.emit('game:event', event as string)
```

### game:event - Fires when a game event is received
```typescript
socket.on('game:event', (eventData: any) => {
  // Do stuff here
})
```

### game:ended - Fired when a game finishes
```typescript
socket.on('game:ended', (match: Match, teamnum: 0 | 1) => {
  // Do stuff here
})
```

# Overlay

### overlay:list - Lists the current connected overlays
```typescript
socket.emit('overlay:list', (list: Overlay[]) => {
  // Do stuff here
})
```

### overlay:deactivate - Deactivates the specified overlay
```typescript
socket.emit('overlay:deactivate', email, name)
```

### overlay:show_scene - Tells the overlay to show the specified scene
```typescript
socket.emit('overlay:show_scene', data as Partial<Scene>)
```

### overlay:hide_scene - Tells the overlay to hide the specified scene
```typescript
socket.emit('overlay:hide_scene', data as Partial<Scene>)
```

### overlay:activated - Fires when an overlay gets activated
```typescript
socket.on('overlay:activated', (overlays: { email: string; overlays: { name: string; id: string }[] }[]) => {
  // Do stuff here
})
```

### overlay:deactivated - Fires when an overlay gets deactivated
```typescript
socket.on('overlay:deactivated', (email: string; id: string) => {
  // Do stuff here
})
```

# Plugin 

### plugin:activated - Fires when a plugin gets activated
```typescript
socket.on('plugin:activated', (plugins: { email: string; plugins: { name: string; id: string }[] }[]) => {
  // Do stuff here
})
```

### plugin:deactivated - Fires when a plugin gets deactivated
```typescript
socket.on('plugin:deactivated', (email: string; id: string) => {
  // Do stuff here
})
```

# Scene

### scene:show - Fires when a scene gets shown (OVERLAY ONLY)
```typescript
socket.on('scene:show', (data: Partial<Scene>) => {
  // Do stuff here
})
```

### scene:hide - Fires when a scene gets hidden (OVERLAY ONLY)
```typescript
socket.on('scene:hide', (data: Partial<Scene>) => {
  // Do stuff here
})
```