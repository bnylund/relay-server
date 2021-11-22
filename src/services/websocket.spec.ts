import { io, Socket } from 'socket.io-client'
import { Base, RocketLeague } from './live'
import { expect } from 'chai'
import { Auth, Websocket } from '../tests/constants'

let websocket: Socket

after(() => {
  if (websocket) websocket.close()
})

describe('Websocket', () => {
  it('should successfully connect to server', function (done) {
    websocket = io(`http://localhost:${process.env.PORT}`, {
      autoConnect: false,
    })
    websocket.on('connect', () => {
      done()
    })
    websocket.connect()
  })
  it('should get the current match', (done) => {
    websocket.emit('match:get', (match: Base.Match, err?: Error) => {
      expect(err).to.not.exist
      expect(match).to.exist
      expect(match.bestOf).to.be.equal(5)
      done()
    })
  })
  it("should fail to get the current game when it hasn't started", (done) => {
    websocket.emit('game:get', (game: Base.Game, err?: Error) => {
      expect(err).to.exist
      expect(game).to.be.equal(null)
      done()
    })
  })
  it(
    'should not authenticate with invalid credentials' /*, (done) => {
    websocket.emit('login', 'INVALID_TOKEN', 'CONTROLBOARD', (status: string, info: any) => {
      expect(status).to.be.equal('fail')
      expect(info).to.exist
      expect(info.name).to.exist
      expect(info.version).to.exist
      expect(info.author).to.exist
      done()
    })
  }*/,
  )

  describe('Plugin', () => {
    beforeEach(() => {
      websocket.removeAllListeners('game:update_state')
      websocket.removeAllListeners('game:match_ended')
      websocket.removeAllListeners('game:match_destroyed')
    })
    it('should log in successfully with valid credentials', (done) => {
      websocket.emit('login', Auth.USER1_TOKEN, 'PLUGIN', (status: string, info: any) => {
        expect(status).to.be.equal('good')
        expect(info).to.exist
        expect(info.name).to.exist
        expect(info.version).to.exist
        expect(info.author).to.exist
        done()
      })
    })
    it('should successfully parse an update_state event - RL', (done) => {
      websocket.on('game:update_state', () => {
        websocket.emit('game:get', (game: RocketLeague.Game, err?: Error) => {
          expect(game.arena).to.be.equal('DFH Stadium')
          expect(game.ballSpeed).to.be.equal(67.2315)
          expect(game.ballTeam).to.be.equal(0)
          expect(game.hasTarget).to.be.false
          expect(game.isOT).to.be.true
          expect(game.isReplay).to.be.false
          expect(game.target).to.be.equal('')
          expect(game.time).to.be.equal(110.25)
          expect(game.ballPosition.x).to.be.equal(10)
          expect(game.ballPosition.y).to.be.equal(20)
          expect(game.ballPosition.z).to.be.equal(30)
          expect(game.match_guid).to.be.equal('TEST_ID')
          expect(game.teams.length).to.be.equal(2)
          expect(game.winner).to.be.equal(-1)
          expect(game.hasWinner).to.be.false
          done()
        })
      })
      websocket.emit('game:event', JSON.stringify(Websocket.UPDATE_STATE))
    })
    it('should successfully parse an update_state event - CS:GO')
    it('should successfully parse a match_ended event', (done) => {
      websocket.on('game:match_ended', () => {
        websocket.emit('match:get', (match: Base.Match) => {
          expect(match.hasWinner).to.be.false
          expect(match.game.hasWinner).to.be.true
          expect(match.game.winner).to.be.equal(1)
          expect(match.game.teams[1].series).to.be.equal(1)
          done()
        })
      })
      websocket.emit('game:event', JSON.stringify(Websocket.MATCH_ENDED))
    })
    it('should successfully parse a match_destroyed event', (done) => {
      websocket.on('game:match_destroyed', () => {
        websocket.emit('match:get', (match: Base.Match) => {
          expect(match.game).to.be.undefined
          done()
        })
      })
      websocket.emit('game:event', JSON.stringify(Websocket.MATCH_DESTROYED))
    })
  })

  describe('Control Board', () => {
    beforeEach(() => {
      websocket.removeAllListeners('match:updated')
      websocket.removeAllListeners('match:team_set')
    })
    it('should log in successfully with valid credentials', (done) => {
      websocket.emit('login', Auth.USER1_TOKEN, 'CONTROLBOARD', (status: string, info: any) => {
        expect(status).to.be.equal('good')
        expect(info).to.exist
        expect(info.name).to.exist
        expect(info.version).to.exist
        expect(info.author).to.exist
        done()
      })
    })
    it('should successfully update the match', (done) => {
      websocket.on('match:updated', (match: Base.Match) => {
        expect(match.bestOf).to.be.equal(7)
        expect(match.teamSize).to.be.equal(4)
        expect(match.matchTitle).to.be.equal('TEST TITLE')
        expect(match.hasWinner).to.be.false
        expect(match.winner).to.be.equal(-1)
        done()
      })
      websocket.emit('match:update', Websocket.MATCH_UPDATE)
    })
    it('should successfully set a team', (done) => {
      websocket.on('match:team_set', (teamnum: number, team: Base.Team) => {
        expect(teamnum).to.be.equal(0)
        expect(team.roster.length).to.be.equal(3)
        expect(team.name).to.be.equal('Test Team')
        expect(team.avatar).to.be.equal('https://')
        expect(team.score).to.be.equal(0)
        expect(team.series).to.be.equal(0)
        done()
      })
      websocket.emit('match:set_team', 0, Websocket.TEAM_UPDATE, (err) => {})
    })
    it('should error out when setting an out of bounds team', (done) => {
      websocket.emit('match:set_team', 3, Websocket.TEAM_UPDATE, (err?: string) => {
        expect(err).to.be.equal('Index out of bounds.')
        done()
      })
    })
  })
})
