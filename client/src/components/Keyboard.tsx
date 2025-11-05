interface Props {
  onKey: (key: string) => void;
  letterStates: Record<string, "correct" | "present" | "absent">;
}

const rows = [
  ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
  ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
  ["ENTER", "Z", "X", "C", "V", "B", "N", "M", "BACKSPACE"],
];

export function Keyboard({ onKey, letterStates }: Props) {
  const keyBg = (letter: string) => {
    const s = letterStates[letter];
    if (s === "correct") return "bg-green-600";
    if (s === "present") return "bg-yellow-500";
    if (s === "absent") return "bg-gray-700";
    return "bg-gray-600";
  };

  return (
    <div className="flex flex-col gap-2 mt-4 select-none">
      {rows.map((row, i) => (
        <div key={i} className="flex justify-center gap-1">
          {row.map((k) => {
            const wide = k === "ENTER" || k === "BACKSPACE";
            return (
              <button
                key={k}
                onClick={() => onKey(k)}
                className={`h-14 ${wide ? "px-4" : "w-10"} rounded font-semibold text-sm text-white ${keyBg(
                  k
                )} transition-colors`}
              >
                {k === "BACKSPACE" ? "←" : k}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}