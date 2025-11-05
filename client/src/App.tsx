import { useEffect, useState, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";

type Role = "setter" | "guesser";
type CellState = "correct" | "present" | "absent" | "empty";

// CRITICAL: Use VITE_API_URL with fallback
const API_URL = import.meta.env.VITE_API_URL?.trim();
if (!API_URL) {
  console.error("VITE_API_URL is missing! Add it in Vercel → Settings → Environment Variables");
}

const socket: Socket = io(API_URL || "http://localhost:4000", {
  autoConnect: false,
  transports: ["websocket"],
});

export default function App() {
  const [room, setRoom] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const roleRef = useRef<Role | null>(null);
  useEffect(() => { roleRef.current = role; }, [role]);

  const [showModal, setShowModal] = useState(false);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [feedbacks, setFeedbacks] = useState<CellState[][]>([]);
  const [current, setCurrent] = useState("");
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(1);
  const [isConnecting, setIsConnecting] = useState(true);
  const [connectError, setConnectError] = useState(false);

  const handleKey = useCallback(
    (key: string) => {
      if (gameOver || role !== "guesser") return;
      if (key === "ENTER" && current.length === 5) {
        socket.emit("guess", { room: room!, guess: current });
      } else if (key === "BACKSPACE") {
        setCurrent(c => c.slice(0, -1));
      } else if (/^[A-Z]$/.test(key) && current.length < 5) {
        setCurrent(c => c + key);
      }
    },
    [current, gameOver, role, room]
  );

  useEffect(() => {
    // FIXED: Connect only after DOM is ready
    const timer = setTimeout(() => {
      if (API_URL) {
        console.log("Connecting to server:", API_URL);
        socket.connect();
      } else {
        setConnectError(true);
      }
      setIsConnecting(false);
    }, 200);

    socket.on("connect", () => {
      console.log("Connected to server:", socket.id);
      setErrorMsg("");
      setConnectError(false);
    });

    socket.on("disconnect", (reason) => {
      console.log("Disconnected:", reason);
      setErrorMsg(`Disconnected: ${reason}`);
    });

    socket.on("connect_error", (err) => {
      console.error("Connection failed:", err.message);
      setErrorMsg("Cannot reach server. Check URL.");
      setConnectError(true);
    });

    socket.on("room-created", ({ room, role }: { room: string; role: Role }) => {
      setRoom(room);
      setRole(role);
      setShowModal(role === "setter");
    });

    socket.on("room-joined", ({ room, role }: { room: string; role: Role }) => {
      setRoom(room);
      setRole(role);
    });

    socket.on("opponent-joined", () => {
      if (roleRef.current === "setter") setShowModal(true);
    });

    socket.on("game-started", () => {
      setGuesses([]);
      setFeedbacks([]);
      setCurrent("");
      setGameOver(false);
      setWon(false);
      setErrorMsg("");
      setShowModal(false);
      setStarted(true);
    });

    socket.on("guess-result", ({ guess, feedback, won, over }: any) => {
      setGuesses(g => [...g, guess]);
      setFeedbacks(f => [...f, feedback]);
      setCurrent("");
      if (over) {
        setGameOver(true);
        setWon(won);
      }
    });

    socket.on("roles-swapped", ({ newRole }: { newRole: Role }) => {
      setRole(newRole);
      setShowModal(newRole === "setter");
      setStarted(false);
      setGuesses([]);
      setFeedbacks([]);
      setCurrent("");
      setGameOver(false);
      setWon(false);
      setRound(r => r + 1);
    });

    socket.on("error", (msg: string) => setErrorMsg(msg));

    return () => {
      clearTimeout(timer);
      socket.off();
      socket.disconnect();
    };
  }, []);

  const createRoom = () => socket.emit("create");
  const joinRoom = (code: string) => {
    const c = code.trim().toUpperCase();
    if (c) socket.emit("join", { room: c });
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") handleKey("ENTER");
      else if (e.key === "Backspace") handleKey("BACKSPACE");
      else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleKey]);

  useEffect(() => {
    setStarted(false);
  }, [room]);

  useEffect(() => {
    if (gameOver && room) {
      const timer = setTimeout(() => {
        socket.emit("request-role-swap", { room });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [gameOver, room]);

  // FIXED: Show loading, error, or lobby
  if (isConnecting) {
    return (
      <div className="app-container" style={{ textAlign: "center", padding: "2rem" }}>
        <h1 className="title">Wordle Duel</h1>
        <p style={{ color: "#9ca3af" }}>Connecting to server...</p>
      </div>
    );
  }

  if (!API_URL || connectError) {
    return (
      <div className="app-container" style={{ textAlign: "center", padding: "2rem" }}>
        <h1 className="title">Wordle Duel</h1>
        <p style={{ color: "#ef4444", margin: "1rem 0" }}>
          {API_URL ? "Cannot connect to server" : "VITE_API_URL not set"}
        </p>
        <p style={{ color: "#9ca3af", fontSize: "0.9rem" }}>
          {API_URL ? "Check server URL" : "Add VITE_API_URL in Vercel"}
        </p>
      </div>
    );
  }

  if (!room) {
    return <Lobby onCreate={createRoom} onJoin={joinRoom} error={errorMsg} />;
  }

  const letterStates = feedbacks
    .flatMap((row, i) => row.map((state, j) => ({ letter: guesses[i][j], state })))
    .reduce((acc, { letter, state }) => {
      if (!acc[letter] || priority(state) > priority(acc[letter])) acc[letter] = state;
      return acc;
    }, {} as Record<string, CellState>);

  function priority(s: CellState) {
    return s === "correct" ? 2 : s === "present" ? 1 : 0;
  }

  // === GUESSER VIEW ===
  if (role === "guesser") {
    if (!started) {
      return (
        <div className="app-container">
          <h1 className="title">Wordle Duel</h1>
          <p className="room-code">Room: {room} • Round {round}</p>
          {errorMsg && <p className="error">{errorMsg}</p>}
          <p className="status">Waiting for setter to lock the word...</p>
        </div>
      );
    }

    return (
      <div className="app-container">
        <h1 className="title">Wordle Duel</h1>
        <p className="room-code">Room: {room} • Round {round}</p>
        {errorMsg && <p className="error">{errorMsg}</p>}
        <div className="status-row">
          <div>Attempts: {guesses.length} / 6</div>
          <div>{gameOver ? (won ? "You won!" : "You lost!") : "Good luck!"}</div>
        </div>
        <Board guesses={guesses} feedbacks={feedbacks} current={current} />
        <Keyboard onKey={handleKey} letterStates={letterStates} disabled={gameOver} />
        {gameOver && (
          <p className={`game-over ${won ? "" : "lost"}`}>
            {won ? "YOU WON! Get ready to set the word..." : "YOU LOST! Your turn to set..."}
          </p>
        )}
      </div>
    );
  }

  // === SETTER VIEW ===
  if (role === "setter") {
    if (started) {
      return (
        <div className="app-container">
          <h1 className="title">Wordle Duel</h1>
          <p className="room-code">Room: {room} • Round {round}</p>
          {errorMsg && <p className="error">{errorMsg}</p>}
          <Board guesses={guesses} feedbacks={feedbacks} current={current} />
          {gameOver && (
            <p className={`game-over ${won ? "" : "lost"}`}>
              {won ? "YOU WON! Get ready to guess..." : "YOU LOST! Your turn to guess..."}
            </p>
          )}
        </div>
      );
    }

    return (
      <div className="app-container">
        <h1 className="title">Wordle Duel</h1>
        <p className="room-code">Room: {room} • Round {round}</p>
        {errorMsg && <p className="error">{errorMsg}</p>}
        {showModal && <SetWordModal room={room!} socket={socket} onClose={() => setShowModal(false)} />}
        {!showModal && <p className="status">Waiting for guesser to join...</p>}
      </div>
    );
  }

  return null;
}

// === BOARD ===
function Board({ guesses, feedbacks, current }: { guesses: string[]; feedbacks: CellState[][]; current: string }) {
  const rows = [
    ...guesses.map((g, i) => ({
      word: g,
      fb: feedbacks[i],
      revealed: true
    })),
    { word: current.padEnd(5, " "), fb: Array(5).fill("empty" as CellState), revealed: false },
    ...Array.from({ length: 5 - guesses.length }, () => ({
      word: "     ",
      fb: Array(5).fill("empty" as CellState),
      revealed: false
    }))
  ].slice(0, 6);

  return (
    <div className="board">
      {rows.map((row, i) => (
        <div key={i} className="row">
          {row.word.split("").map((letter, j) => {
            const state = row.fb[j];
            let className = "tile";
            if (row.revealed && state !== "empty") {
              className += ` revealed ${state}`;
            } else if (letter !== " ") {
              className += " filled";
            }
            return (
              <div key={j} className={className}>
                <span>{letter}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// === KEYBOARD ===
function Keyboard({ onKey, letterStates, disabled }: any) {
  const rows = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACKSPACE"],
  ];

  const getKeyClass = (k: string) => {
    const state = letterStates?.[k];
    let className = "key";
    if (state === "correct") className += " correct";
    else if (state === "present") className += " present";
    else if (state === "absent") className += " absent";
    if (k === "ENTER" || k === "BACKSPACE") className += " wide";
    if (disabled) className += " disabled";
    return className;
  };

  return (
    <div className="keyboard">
      {rows.map((row, i) => (
        <div key={i} className="keyboard-row">
          {row.map(k => (
            <button
              key={k}
              onClick={() => !disabled && onKey(k)}
              disabled={disabled}
              className={getKeyClass(k)}
            >
              {k === "BACKSPACE" ? "Backspace" : k}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

// === MODAL ===
function SetWordModal({ room, socket, onClose }: any) {
  const [word, setWord] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    const w = word.toUpperCase().trim();
    if (!/^[A-Z]{5}$/.test(w)) {
      setError("Exactly 5 letters");
      return;
    }
    socket.emit("set-word", { room, word: w });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Set Secret Word</h2>
        <input
          autoFocus
          value={word}
          onChange={e => {
            setWord(e.target.value.toUpperCase().slice(0, 5));
            setError("");
          }}
          onKeyDown={e => e.key === "Enter" && submit()}
          className="modal-input"
          placeholder="_____"
        />
        {error && <p style={{ color: '#ef4444', marginTop: '0.5rem' }}>{error}</p>}
        <div className="modal-buttons">
          <button onClick={submit} className="btn btn-primary">Lock Word</button>
          <button onClick={onClose} className="btn btn-secondary">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// === LOBBY ===
function Lobby({ onCreate, onJoin, error }: any) {
  const [code, setCode] = useState("");
  return (
    <div className="lobby">
      <h1 className="title">Wordle Duel</h1>
      <button onClick={onCreate} className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.25rem' }}>
        Create New Game
      </button>
      <div className="lobby-input-group">
        <input
          placeholder="Room code"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          maxLength={6}
          className="lobby-input"
        />
        <button onClick={() => onJoin(code)} className="btn btn-primary">
          Join
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}