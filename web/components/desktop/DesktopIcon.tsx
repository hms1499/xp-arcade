"use client";
export function DesktopIcon({
  label,
  emoji,
  onOpen,
}: {
  label: string;
  emoji: string;
  onOpen: () => void;
}) {
  return (
    <button
      onDoubleClick={onOpen}
      className="flex flex-col items-center w-20 text-white text-xs select-none focus:outline-dashed focus:outline-1"
    >
      <span className="text-4xl drop-shadow-md">{emoji}</span>
      <span
        className="px-1 mt-1"
        style={{ textShadow: "1px 1px 2px black" }}
      >
        {label}
      </span>
    </button>
  );
}
