import { useState } from "react";
import { Socket } from "socket.io-client";

interface Props {
  room: string;
  socket: Socket;
  onClose: () => void;
}

export function SetWordModal({ room, socket, onClose }: Props) {
  const [word, setWord] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    const w = word.trim().toUpperCase();
    if (!/^[A-Z]{5}$/.test(w)) {
      setError("Enter a 5-letter word");
      return;
    }
    socket.emit("set-word", { room, word: w });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 p-6 rounded-lg max-w-sm w-full">
        <h2 className="text-xl font-bold mb-4">Set the secret word</h2>
        <input
          autoFocus
          value={word}
          onChange={(e) => setWord(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          maxLength={5}
          className="w-full p-2 text-2xl text-center uppercase bg-gray-700 rounded"
        />
        {error && <p className="text-red-400 mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={submit} className="flex-1 bg-green-600 py-2 rounded">
            Lock Word
          </button>
          <button onClick={onClose} className="flex-1 bg-gray-600 py-2 rounded">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}