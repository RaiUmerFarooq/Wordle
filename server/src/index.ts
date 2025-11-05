import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";

// Load .env
dotenv.config();

const app = express();
const server = http.createServer(app);

// FIXED: Use FRONTEND_URL from .env
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

const io = new Server(server, {
  cors: {
    origin: frontendUrl,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

type Role = "setter" | "guesser";

interface Game {
  secret: string;
  guesses: string[];
  feedbacks: ("correct" | "present" | "absent")[][];
  players: Role[];
  started: boolean;
  setterSocketId: string | null;
  locked: boolean;
}

const games = new Map<string, Game>();

function createRoom(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function evaluate(guess: string, secret: string): ("correct" | "present" | "absent")[] {
  const result: ("correct" | "present" | "absent")[] = [];
  const count: Record<string, number> = {};

  for (const c of secret) count[c] = (count[c] || 0) + 1;

  for (let i = 0; i < 5; i++) {
    if (guess[i] === secret[i]) {
      result[i] = "correct";
      count[guess[i]]--;
    }
  }
  for (let i = 0; i < 5; i++) {
    if (result[i]) continue;
    if (secret.includes(guess[i]) && count[guess[i]] > 0) {
      result[i] = "present";
      count[guess[i]]--;
    } else {
      result[i] = "absent";
    }
  }
  return result;
}

io.on("connection", (socket) => {
  console.log("CONNECTED:", socket.id);

  socket.on("create", () => {
    const room = createRoom();
    games.set(room, {
      secret: "",
      guesses: [],
      feedbacks: [],
      players: ["setter"],
      started: false,
      setterSocketId: socket.id,
      locked: false,
    });
    socket.join(room);
    socket.emit("room-created", { room, role: "setter" });
  });

  socket.on("join", ({ room }) => {
    const game = games.get(room);
    if (!game) return socket.emit("error", "Room not found");
    if (game.players.includes("guesser")) return socket.emit("error", "Room full");
    if (game.locked && game.started) return socket.emit("error", "Game in progress");

    game.players.push("guesser");
    socket.join(room);
    socket.emit("room-joined", { room, role: "guesser" });

    const setter = game.setterSocketId ? io.sockets.sockets.get(game.setterSocketId) : null;
    if (setter && setter.rooms.has(room)) setter.emit("opponent-joined");

    if (game.locked && !game.started) {
      game.started = true;
      io.to(room).emit("game-started");
    }
  });

  socket.on("set-word", ({ room, word }) => {
    const game = games.get(room);
    if (!game || game.secret || game.setterSocketId !== socket.id) return;
    const w = word.toUpperCase();
    if (!/^[A-Z]{5}$/.test(w)) return socket.emit("error", "Invalid word");

    game.secret = w;
    game.locked = true;

    if (game.players.includes("guesser")) {
      game.started = true;
      io.to(room).emit("game-started");
    }
  });

  socket.on("guess", ({ room, guess }) => {
    const game = games.get(room);
    if (!game || !game.secret || !game.started) return;
    const g = guess.toUpperCase();
    if (!/^[A-Z]{5}$/.test(g)) return;

    const fb = evaluate(g, game.secret);
    game.guesses.push(g);
    game.feedbacks.push(fb);

    const won = fb.every(s => s === "correct");
    const over = won || game.guesses.length >= 6;

    io.to(room).emit("guess-result", { guess: g, feedback: fb, won, over });
  });

  socket.on("request-role-swap", ({ room }) => {
    const game = games.get(room);
    if (!game || !game.started || game.players.length < 2) return;

    const [oldSetter, oldGuesser] = game.players;
    game.players = [oldGuesser, oldSetter];
    game.secret = "";
    game.guesses = [];
    game.feedbacks = [];
    game.started = false;
    game.locked = false;

    const roomSockets = Array.from(io.sockets.adapter.rooms.get(room) || []);
    const newSetterId = roomSockets.find(id => id !== game.setterSocketId) || roomSockets[0];
    game.setterSocketId = newSetterId;

    roomSockets.forEach(id => {
      const isNewSetter = id === newSetterId;
      io.to(id).emit("roles-swapped", { newRole: isNewSetter ? "setter" : "guesser" });
    });

    setTimeout(() => {
      const newSetter = io.sockets.sockets.get(newSetterId);
      if (newSetter && newSetter.rooms.has(room)) {
        newSetter.emit("opponent-joined");
      }
    }, 800);
  });

  socket.on("disconnect", () => {
    console.log("DISCONNECTED:", socket.id);
  });
});

// Health check
app.get("/", (req, res) => {
  res.send(`Wordle Duel Server Running! frontendUrl=${frontendUrl}`);
});

// Vercel serverless export
module.exports = app;