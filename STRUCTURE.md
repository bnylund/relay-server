# Relay - NEW STRUCTURE

Point of restructure: absolutely NO data is stored on the relay, except for LIVE game data. This removes the need for redis.

```json
  Dockerfile
  package.json
  ...
  tsconfig.json
  src/
    api/
      v1/
        teams/ /* pending transition to rl-stats-platform */
          index.ts
          create.ts
          modify.ts
          delete.ts
    models/
      team.ts
      scene.ts
    services/
      live.ts /* allows use without redis */
      websocket.ts
      http.ts
    index.ts
```
