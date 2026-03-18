const express = require("express")
const http = require("http")
const { Server } = require("socket.io")

const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static("public"))

/* ---------- STATE ---------- */

let teams = []
let nflTeams = []
let players = []
let drafted = []

let currentPick = 0
let draftOrder = []

let timer = 60
let interval = null

/* ---------- POSITION LIMITS ---------- */

const POSITION_LIMITS = {
  QB: 2,
  RB: 4,
  WR: 4,
  TE: 2,
  Oline: 5,

  LE: 2,
  RE: 2,
  NT: 2,

  LOLB: 2,
  LILB: 2,
  RILB: 2,
  ROLB: 2,

  LCB: 2,
  RCB: 2,
  FS: 2,
  SS: 2,

  K: 1,
  P: 1
}

/* ---------- HELPERS ---------- */

function snakeOrder(teamCount, rounds){
  let order = []
  for(let r = 0; r < rounds; r++){
    if(r % 2 === 0){
      for(let i = 0; i < teamCount; i++) order.push(i)
    } else {
      for(let i = teamCount - 1; i >= 0; i--) order.push(i)
    }
  }
  return order
}

function getTeamRosterCounts(teamIndex){
  let counts = {}

  for(let i = 0; i < drafted.length; i++){
    let owner = draftOrder[i]
    if(owner !== teamIndex) continue

    let pick = drafted[i]
    if(!pick || pick === "SKIPPED") continue

    let player = players.find(p => p.name === pick)
    let pos = player ? player.position : "TEAM"

    counts[pos] = (counts[pos] || 0) + 1
  }

  return counts
}

/* ---------- TIMER ---------- */

function startTimer(){
  if(interval) clearInterval(interval)

  timer = 60

  interval = setInterval(()=>{
    timer--
    io.emit("timer", timer)

    if(timer <= 0){
      skipPick()
    }
  }, 1000)
}

/* ---------- SKIP ---------- */

function skipPick(){
  drafted.push("SKIPPED")
  currentPick++
  emitState()
  startTimer()
}

/* ---------- STATE ---------- */

function emitState(){

  let rosters = teams.map((_, i)=>getTeamRosterCounts(i))

  io.emit("state", {
    teams,
    nflTeams,
    players,
    drafted,
    currentPick,
    draftOrder,
    rosters,
    POSITION_LIMITS
  })
}

/* ---------- SOCKET ---------- */

io.on("connection", socket => {

  emitState()

  socket.on("setup", data => {
    teams = data.teams || []
    nflTeams = data.nflTeams || []
    players = data.players || []

    drafted = []
    currentPick = 0

    draftOrder = snakeOrder(teams.length, 20)

    startTimer()
    emitState()
  })

  socket.on("loadState", data => {
    teams = data.teams || []
    nflTeams = data.nflTeams || []
    players = data.players || []
    drafted = data.drafted || []
    currentPick = data.currentPick || 0
    draftOrder = data.draftOrder || []

    startTimer()
    emitState()
  })

  socket.on("draft", name => {

    if(!name) return
    if(drafted.includes(name)) return

    let teamIndex = draftOrder[currentPick]

    let player = players.find(p => p.name === name)
    let position = player ? player.position : "TEAM"

    let counts = getTeamRosterCounts(teamIndex)
    let limit = POSITION_LIMITS[position] || 99

    if((counts[position] || 0) >= limit){
      socket.emit("errorMsg", "Limit reached for " + position)
      return
    }

    drafted.push(name)
    currentPick++

    startTimer()
    emitState()
  })

  socket.on("replacePick", ({ index, name }) => {
    if(drafted[index] !== "SKIPPED") return
    if(drafted.includes(name)) return

    drafted[index] = name
    emitState()
  })

  socket.on("forcePick", ({ index, name }) => {
    if(index < 0 || index >= draftOrder.length) return
    drafted[index] = name
    emitState()
  })

  socket.on("undo", () => {
    if(!drafted.length) return
    drafted.pop()
    currentPick--
    emitState()
  })

  socket.on("pause", () => {
    clearInterval(interval)
    interval = null
  })

})

server.listen(3000, () => {
  console.log("Server running on 3000")
})