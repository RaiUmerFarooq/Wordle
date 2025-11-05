type CellState = "correct" | "present" | "absent" | "empty";

interface Props {
  guesses: string[];
  feedbacks: CellState[][];
  current: string;
}

export function Board({ guesses, feedbacks, current }: Props) {
  const rows = [...guesses.map((g, i) => ({ word: g, fb: feedbacks[i] })), { word: current.padEnd(5, " "), fb: [] as CellState[] }];

  const cellBg = (s: CellState) => {
    if (s === "correct") return "bg-green-600";
    if (s === "present") return "bg-yellow-500";
    if (s === "absent") return "bg-gray-700";
    return "bg-gray-800 border-gray-600";
  };

  return (
    <div className="grid grid-rows-6 gap-1 my-6">
      {rows.map((row, rIdx) => (
        <div key={rIdx} className="grid grid-cols-5 gap-1">
          {[0, 1, 2, 3, 4].map((cIdx) => {
            const letter = row.word[cIdx] ?? "";
            const state = row.fb[cIdx] ?? "empty";
            return (
              <div
                key={cIdx}
                className={`w-14 h-14 flex items-center justify-center text-2xl font-bold border-2 ${cellBg(
                  state
                )} transition-colors duration-200`}
              >
                {letter}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}