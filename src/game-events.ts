import { RocketLeague } from './services/live'

export interface UpdateState {
  event: string
  hasGame: boolean
  game: RocketLeague.Game
  players: RocketLeague.Player[]
  match_guid: string
}

export interface BallHit {
  ball: {
    location: RocketLeague.Position
    post_hit_speed: number
    pre_hit_speed: number
  }
  player: {
    id: string
    name: string
  }
}

export interface Statfeed {
  type: string
  event_name: string
  main_target: {
    id: string
    name: string
    team_num: number
  }
  secondary_target: {
    id: string
    name: string
    team_num: number
  }
}

export interface GoalScored {
  goalspeed: number
  ball_last_touch: {
    player: string
    speed: number
  }
  impact_location: {
    x: number
    y: number
  }
  scorer: {
    id: string
    name: string
    teamnum: number
  }
}

export interface MatchEnded {
  winner_team_num: number
}
