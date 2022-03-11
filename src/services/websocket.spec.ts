process.env.RELAY_ENV = 'test'
import { io, Socket } from 'socket.io-client'
import { expect } from 'chai'

import { Websocket } from '../tests/constants'
import { websocket as wsService } from '../services/http'
import matches, { Base } from './live'
import axios from 'axios'

let websocket: Socket

after(() => {
  if (websocket) websocket.close()
})

describe('Websocket', () => {
  it('should connect to the server', (done) => {
    if (websocket) websocket.close()
    websocket = io(`http://localhost:${process.env.PORT}`, {
      autoConnect: false,
    })
    websocket.on('connect', () => {
      done()
    })
    websocket.connect()
  })
  it('should create a new match', () => {
    matches.push({
      bestOf: 5,
      teamSize: 3,
      hasWinner: false,
      winner: -1,
      id: Websocket.MATCH_ID,
      stats_id: '',
    })
    expect(matches.length).to.be.equal(1)
  })
  it('should get all running matches', (done) => {
    websocket.emit('match:get_all', (matches: Base.Match[]) => {
      expect(matches).to.exist
      expect(matches.length).to.be.equal(1)
      done()
    })
  })
  it('should create a login endpoint for the current socket', (done) => {
    websocket.emit('login', 'PLUGIN', (url: string) => {
      expect(url).to.exist
      expect(url).to.be.equal(`/login/${websocket.id}`)
      done()
    })
  })

  describe('Plugin', () => {
    before((done) => {
      if (websocket) websocket.close()
      websocket = io(`http://localhost:${process.env.PORT}`, {
        autoConnect: false,
      })
      websocket.on('connect', () => {
        done()
      })
      websocket.connect()
    })
    beforeEach(() => {
      websocket.removeAllListeners('game:update_state')
      websocket.removeAllListeners('game:match_ended')
      websocket.removeAllListeners('game:match_destroyed')
    })
    it('should log in successfully', (done) => {
      websocket.emit('login', 'PLUGIN', () => {
        done()
      })
    })
    it('should successfully be assigned to a match', (done) => {
      websocket.emit('relay:assign', websocket.id, Websocket.MATCH_ID, () => {
        done()
      })
    })
    it('should successfully parse an update_state event - RL', (done) => {
      websocket.on('game:update_state', () => {
        websocket.emit('match:get', Websocket.MATCH_ID, (match: Base.Match) => {
          expect(match).to.exist
          const { game } = match
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
        websocket.emit('match:get', Websocket.MATCH_ID, (match: Base.Match) => {
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
        websocket.emit('match:get', Websocket.MATCH_ID, (match: Base.Match) => {
          expect(match.game).to.be.undefined
          done()
        })
      })
      websocket.emit('game:event', JSON.stringify(Websocket.MATCH_DESTROYED))
    })
  })

  describe('Control Board', () => {
    before((done) => {
      if (websocket) websocket.close()
      websocket = io(`http://localhost:${process.env.PORT}`, {
        autoConnect: false,
      })
      websocket.on('connect', () => {
        done()
      })
      websocket.connect()
    })
    beforeEach(() => {
      websocket.removeAllListeners('match:updated')
      websocket.removeAllListeners('match:team_set')
    })
    it('should log in successfully with valid credentials', (done) => {
      websocket.emit('login', 'CONTROLBOARD', () => {
        done()
      })
    })
    it('should successfully update the match', (done) => {
      websocket.on('match:updated', (id: string, match?: Base.Match) => {
        console.log(id)
        console.log(match)
        expect(id).to.be.equal(Websocket.MATCH_ID)
        expect(match.bestOf).to.be.equal(7)
        expect(match.teamSize).to.be.equal(4)
        expect(match.hasWinner).to.be.false
        expect(match.winner).to.be.equal(-1)
        expect(match.id).to.be.equal(Websocket.MATCH_ID)
        done()
      })
      websocket.emit('match:update', Websocket.MATCH_ID, Websocket.MATCH_UPDATE)
    })
    it('should successfully set a team', (done) => {
      websocket.on('match:team_set', (match: string, teamnum: number, team: Base.Team) => {
        console.log(match)
        console.log(teamnum)
        console.log(team)
        expect(match).to.be.equal(Websocket.MATCH_ID)
        expect(teamnum).to.be.equal(0)
        expect(team.roster.length).to.be.equal(3)
        expect(team.name).to.be.equal('Test Team')
        expect(team.avatar).to.be.equal('https://')
        expect(team.score).to.be.equal(0)
        expect(team.series).to.be.equal(0)
        done()
      })
      console.log(`emitting for match id ${Websocket.MATCH_ID}`)
      console.log(matches)
      websocket.emit('match:set_team', Websocket.MATCH_ID, 0, Websocket.TEAM_UPDATE, (err?: string) => {
        console.log(`err: ${err}`)
      })
    })
    it('should error out when setting an out of bounds team', (done) => {
      websocket.emit('match:set_team', Websocket.MATCH_ID, 3, Websocket.TEAM_UPDATE, (err?: string) => {
        expect(err).to.be.equal('Index out of bounds.')
        done()
      })
    })
    it('should error out when setting a team for an invalid match', (done) => {
      websocket.emit('match:set_team', 'VERY_INVALID_MATCH_ID', 1, Websocket.TEAM_UPDATE, (err?: string) => {
        console.log(err)
        expect(err).to.be.equal('Match not found.')
        done()
      })
    })
  })

  describe('Overlay', () => {
    before((done) => {
      if (websocket) websocket.close()
      websocket = io(`http://localhost:${process.env.PORT}`, {
        autoConnect: false,
      })
      websocket.on('connect', () => {
        done()
      })
      websocket.connect()
    })
    beforeEach(() => {
      websocket.removeAllListeners('game:event')
    })
    after((done) => {
      if (websocket) {
        websocket.on('disconnect', () => {
          done()
        })
        websocket.close()
      }
    })
    it('should log in successfully with valid credentials', (done) => {
      websocket.emit('login', 'OVERLAY', () => {
        done()
      })
    })
    it('should successfully be assigned to a match', (done) => {
      websocket.emit('relay:assign', websocket.id, Websocket.MATCH_ID, (err?: Error) => {
        done(err)
      })
    })
    it('should receive data for the assigned match', (done) => {
      websocket.on('game:event', (evData) => {
        expect(evData).to.exist
        expect(evData.event).to.be.equal('game:statfeed_event')
        expect(evData.data).to.be.equal('some_data_here')
        done()
      })

      wsService.io.to(Websocket.MATCH_ID).except('plugin').emit('game:event', {
        event: 'game:statfeed_event',
        data: 'some_data_here',
      })
    })
    it('should not receive any data for other matches', (done) => {
      let complete = false
      websocket.on('game:event', (evData) => {
        complete = true
        done('Unexpected data received.')
      })

      // Give it 1500ms to check for updates
      setTimeout(() => {
        if (!complete) done()
      }, 1500)

      wsService.io.to('INVALID_MATCH_ID').except('plugin').emit('game:event', {
        event: 'game:statfeed_event',
        data: 'some_data_here',
      })
    })
    it('should not receive any data after being removed from a match', (done) => {
      websocket.emit('relay:assign', websocket.id, 'Unassigned', (err?: Error) => {
        expect(err).to.be.undefined
        let complete = false
        websocket.on('game:event', (evData) => {
          complete = true
          done('Unexpected data received.')
        })

        // Give it 1500ms to check for updates
        setTimeout(() => {
          if (!complete) done()
        }, 1500)

        wsService.io.to('INVALID_MATCH_ID').except('plugin').emit('game:event', {
          event: 'game:statfeed_event',
          data: 'some_data_here',
        })
      })
    })
  })
})
