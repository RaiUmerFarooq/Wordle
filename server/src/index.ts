import express from "express";
import http from "http";
import { Server, Socket } from "socket.io";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

type Role = "setter" | "guesser";

interface Game {
  secret: string;
  guesses: string[];
  feedbacks: ("correct" | "present" | "absent")[][];
  players: Role[];
  started: boolean;
  setterSocketId: string | null;
  locked: boolean; // NEW: separate flag for word locked
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

io.on("connection", (socket: Socket) => {
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
    console.log("ROOM CREATED:", room);
  });

  socket.on("join", ({ room }: { room: string }) => {
    const game = games.get(room);
    if (!game) return socket.emit("error", "Room not found");
    if (game.players.includes("guesser")) return socket.emit("error", "Room full");
    // FIXED: Only block join if BOTH locked AND started
    if (game.locked && game.started) return socket.emit("error", "Game already in progress");

    game.players.push("guesser");
    socket.join(room);
    socket.emit("room-joined", { room, role: "guesser" });

    // Notify setter
    const setter = io.sockets.sockets.get(game.setterSocketId || "");
    if (setter && setter.rooms.has(room)) {
      setter.emit("opponent-joined");
    }

    // If word is already locked, start game immediately for guesser
    if (game.locked && !game.started) {
      game.started = true;
      io.to(room).emit("game-started");
    }

    console.log("GUESSER JOINED:", room, "locked:", game.locked);
  });

  socket.on("set-word", ({ room, word }: { room: string; word: string }) => {
    const game = games.get(room);
    if (!game || game.secret || game.setterSocketId !== socket.id) return;
    const w = word.toUpperCase();
    if (!/^[A-Z]{5}$/.test(w)) return socket.emit("error", "Invalid word");

    game.secret = w;
    game.locked = true; // Word is locked

    // Only start game if guesser is already in
    if (game.players.includes("guesser")) {
      game.started = true;
      io.to(room).emit("game-started");
    }

    console.log("WORD LOCKED:", w, "in room:", room);
  });

  socket.on("guess", ({ room, guess }: { room: string; guess: string }) => {
    const game = games.get(room);
    if (!game || !game.secret || !game.started) return;
    const g = guess.toUpperCase();
    if (!/^[A-Z]{5}$/.test(g)) return;

    const fb = evaluate(g, game.secret);
    game.guesses.push(g);
    game.feedbacks.push(fb);

    const won = fb.every(s => s === "correct");
    const over = won || game.guesses.length >= 6;

    io.to(room).emit("guess-result", {
      guess: g,
      feedback: fb,
      won,
      over,
      attempts: game.guesses.length,
    });

    if (over) {
      console.log(`GAME OVER in room ${room}. Won: ${won}`);
    }
  });

  socket.on("request-role-swap", ({ room }: { room: string }) => {
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
    const newSetterSocketId = roomSockets.find(id => id !== game.setterSocketId) || roomSockets[0];
    game.setterSocketId = newSetterSocketId;

    roomSockets.forEach(id => {
      const isNewSetter = id === newSetterSocketId;
      const newRole: Role = isNewSetter ? "setter" : "guesser";
      io.to(id).emit("roles-swapped", { newRole });
    });

    setTimeout(() => {
      const newSetter = io.sockets.sockets.get(newSetterSocketId);
      if (newSetter && newSetter.rooms.has(room)) {
        newSetter.emit("opponent-joined");
      }
    }, 800);

    console.log(`ROLES SWAPPED in room ${room}`);
  });

  socket.on("disconnect", () => {
    console.log("DISCONNECTED:", socket.id);
    for (const [room, game] of games.entries()) {
      const socketsInRoom = Array.from(io.sockets.adapter.rooms.get(room) || []);
      if (socketsInRoom.length === 0) {
        games.delete(room);
        console.log("EMPTY ROOM DELETED:", room);
      } else if (game.setterSocketId === socket.id) {
        game.setterSocketId = socketsInRoom.find(id => id !== socket.id) || null;
      }
    }
  });
});

server.listen(4000, () => {
  console.log("SERVER ON http://localhost:4000");
});