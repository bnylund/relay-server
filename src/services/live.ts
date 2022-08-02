let matches: Base.Match[] = []

export function updateMatch(id: string, data: Partial<Base.Match>) {
  const match = matches.find((x) => x.group_id === id)
  if (!match) {
    return undefined
  }
  Object.keys(data).forEach((val) => {
    if (data[val] === null) delete match[val]
    else match[val] = data[val]
  })
  return match
}

// Base structures. Most of these values can be modified by the control board.
export namespace Base {
  export interface Game {
    teams: Base.Team[]
    winner: number
    hasWinner: boolean
    match_guid: string
    [key: string]: any
  }

  export interface Team {
    info: any // Extract team info to its own field, this will be provided by an API
    score: number
    series: number
    [key: string]: any
  }

  export interface Player {
    name: string
    [key: string]: any
  }

  export interface Match {
    game?: Base.Game
    bestOf: number
    hasWinner: boolean
    winner: number
    group_id: string
    [key: string]: any
  }
}

// Anything below this point includes game-specific structures. All of these values will be auto-populated from update_state.
export namespace RocketLeague {
  export interface Game extends Base.Game {
    arena: string
    ballSpeed: number
    ballTeam: number
    hasTarget: boolean
    isOT: boolean
    isReplay: boolean
    target: string
    time: number
    ballPosition: RocketLeague.Position
    id: string
  }

  export interface Team extends Base.Team {
    players: RocketLeague.Player[]
  }

  export interface Player extends Base.Player {
    id: string
    primaryID: string
    team: number
    score: number
    goals: number
    shots: number
    assists: number
    saves: number
    touches: number
    carTouches: number
    hasCar: boolean
    demos: number
    speed: number
    boost: number
    isSonic: boolean
    isDead: boolean
    attacker: string
    location: RocketLeague.Location
    onWall: boolean
    onGround: boolean
    isPowersliding: boolean
  }

  export interface Location extends RocketLeague.Position {
    roll: number
    pitch: number
    yaw: number
  }

  export interface Position {
    x: number
    y: number
    z: number
  }
}

export default matches
