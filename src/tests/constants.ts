import { Base } from '../services/live'

export class Websocket {
  static MATCH_ID: string = 'a1b8e4ff-8ff5-4089-b9c1-fa59472efa58'
  static UPDATE_STATE: any = {
    game: 'ROCKET_LEAGUE',
    event: 'game:update_state',
    data: {
      event: 'game:update_state',
      hasGame: true,
      game: {
        arena: 'DFH Stadium',
        ballSpeed: 67.2315,
        ballTeam: 0,
        hasTarget: false,
        isOT: true,
        isReplay: false,
        target: '',
        time: 110.25,
        ballPosition: {
          x: 10,
          y: 20,
          z: 30,
        },
        match_guid: 'TEST_ID',
        teams: {
          '0': {
            score: 0,
          },
          '1': {
            score: 0,
          },
        },
        winner: -1,
        hasWinner: false,
      },
      players: [],
    },
  }
  static MATCH_ENDED: any = {
    event: 'game:match_ended',
    data: {
      winner_team_num: 1,
    },
  }
  static MATCH_DESTROYED: any = {
    event: 'game:match_destroyed',
  }
  static MATCH_UPDATE: any = {
    bestOf: 7,
    teamSize: 4,
    hasWinner: false,
    winner: -1,
    game: {
      teams: [{}, {}],
    },
  }
  static TEAM_UPDATE: Partial<Base.Team> = {
    roster: ['PLAYER_1', 'PLAYER_2', 'PLAYER_3'],
    name: 'Test Team',
    avatar: 'https://',
    score: 0,
    series: 0,
  }
}
