function getValues(elms) {
  let obj = {}
  for (let i = 0; i < elms.length; i++) if (elms[i].name.length > 0) obj[elms[i].name] = elms[i].value
  return obj
}

$(() => {
  document.getElementById('form').onsubmit = (e) => {
    document.getElementById('error').hidden = true
    document.getElementById('submit').disabled = true
    e.preventDefault()
    $.ajax({
      type: 'POST',
      url: `/login/${socket_id}`,
      data: JSON.stringify({
        ...getValues(e.target.elements),
        type,
      }),
      contentType: 'application/json',
      dataType: 'json',
      success: (data, status, xhr) => {
        document.getElementById('login').innerHTML = "<h2 id='success'>Logged in!</h2>"
        setTimeout(() => {
          window.close()
        }, 3000)
      },
      error: () => {
        document.getElementById('error').hidden = false
        document.getElementById('submit').disabled = false
      },
    })
  }
})
