import io from 'socket.io-client'

const client = io('http://localhost:5555')
client.on('connect', () => {
  console.log('connected!')
  client.emit('get match info', (match) => {
    console.log(match)
  })

  client.emit('login', 'TEST', 'testtoken', 'CONTROLBOARD', (status, info) => {
    console.log(status)
    console.log(info)
  })

  client.on('scene added', (data: any) => {
    console.log('scene added: ', data)
  })

  client.on('scene removed', (data: any) => {
    console.log('scene removed: ', data)
  })

  /*setTimeout(() => {
    console.log('updating...')
    client.emit('update match info', { bestOf: 7, teamSize: 4 }, (err) => {
      if (!err) {
        console.log('updated!')
        client.emit('get match info', (match) => {
          console.log(match)
        })
      }
    })
  }, 1000)*/
})
