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
  RNT: 2,

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

/* ---------- SNAKE ORDER ---------- */

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

/* ---------- ROSTER HELPER ---------- */

function getTeamRosterCounts(teamIndex){

  let counts = {}

  for(let i = 0; i < drafted.length; i++){

    if(!drafted[i] || drafted[i] === "SKIPPED") continue

    let owner = draftOrder[i]
    if(owner !== teamIndex) continue

    let player = players.find(p => p.name === drafted[i])

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
      autoPick()
    }

  }, 1000)
}

/* ---------- AUTO PICK ---------- */

function autoPick(){

  console.log("⏭ Skipping pick")

  drafted.push("SKIPPED")
  currentPick++

  emitState()
  startTimer()
}

/* ---------- EMIT STATE (UPDATED) ---------- */

function emitState(){

  let rosters = teams.map((_, i) => getTeamRosterCounts(i))

  io.emit("state", {
    teams,
    nflTeams,
    players,
    drafted,
    currentPick,
    draftOrder,
    rosters   // 👈 NEW
  })
}

/* ---------- SOCKET ---------- */

io.on("connection", socket => {

  console.log("✅ Client connected")

  emitState()

  /* ---------- SETUP ---------- */

  socket.on("setup", data => {

    if(!data) return

    teams = data.teams || []
    nflTeams = data.nflTeams || []
    players = data.players || []

    drafted = []
    currentPick = 0

    draftOrder = snakeOrder(teams.length, 20)

    startTimer()
    emitState()
  })

  /* ---------- LOAD STATE ---------- */

  socket.on("loadState", data => {

    if(!data) return

    try {
      teams = data.teams || []
      nflTeams = data.nflTeams || []
      players = data.players || []
      drafted = data.drafted || []
      currentPick = data.currentPick || 0
      draftOrder = data.draftOrder || []

      startTimer()
      emitState()

    } catch (err) {
      console.log("❌ Error loading state:", err)
    }
  })

  /* ---------- DRAFT ---------- */

  socket.on("draft", name => {

    if(!name) return

    if(drafted.includes(name)){
      console.log("⚠️ Duplicate pick prevented:", name)
      return
    }

    let teamIndex = draftOrder[currentPick]

    let player = players.find(p => p.name === name)
    let position = player ? player.position : "TEAM"

    let counts = getTeamRosterCounts(teamIndex)
    let limit = POSITION_LIMITS[position] || 99

    if((counts[position] || 0) >= limit){
      console.log("🚫 Position limit reached:", position)
      return
    }

    drafted.push(name)
    currentPick++

    startTimer()
    emitState()
  })

  /* ---------- REPLACE SKIPPED PICK ---------- */

  socket.on("replacePick", ({ index, name }) => {

    if(!name) return

    if(drafted[index] !== "SKIPPED") return
    if(drafted.includes(name)) return

    drafted[index] = name

    emitState()
  })

  /* ---------- FORCE PICK ---------- */

  socket.on("forcePick", ({ index, name }) => {

    if(index < 0 || index >= draftOrder.length) return
    if(!name) return

    const playerExists = players.some(p => p.name === name)
    if(!playerExists) return

    if(drafted.includes(name)) return

    drafted[index] = name

    emitState()
  })

  /* ---------- UNDO ---------- */

  socket.on("undo", () => {

    if(!drafted.length) return

    drafted.pop()
    currentPick--

    emitState()
  })

  /* ---------- PAUSE ---------- */

  socket.on("pause", () => {

    clearInterval(interval)
    interval = null
  })

})

/* ---------- START SERVER ---------- */

const PORT = 3000

server.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT)
})
