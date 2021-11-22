import { Base } from '../services/live'

export class Auth {
  static USER1_EMAIL: string = 'TEST_USER1@nylund.us'
  static USER1_PASSWORD: string = 'test_password'
  static USER1_EXPIRED_TOKEN: string =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjYxODgzN2RmMTVjOTE0ODEzYTJhMzJjMyIsImV4cGlyYXRpb24iOiIyMDIxLTExLTA3VDIwOjMyOjMxLjkxNFoiLCJpYXQiOjE2MzYzMTcxNTF9.nim3WXZSMmNdsX_9gy_Ly68lIM9aPqWedal50EW83RA'
  static USER1_TOKEN: string =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjYxN2IzODNhZWFlZTgzZGViY2E5MWUyNyIsImV4cGlyYXRpb24iOiIyMDM1LTA3LTI1VDE2OjI3OjMxLjEzNFoiLCJpYXQiOjE2MzY5OTM2NTF9.YIvDHqhlJnTY1M3raPYMgnexrxOHT8xrfAE9COr9kr8'
}

export class Websocket {
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
    matchTitle: 'TEST TITLE',
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
