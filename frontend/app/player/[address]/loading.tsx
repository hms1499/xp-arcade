export default function Loading() {
  return (
    <div className="min-h-screen p-4 bg-[#3a6ea5] text-white">
      <div className="bg-[#ece9d8] text-black border border-black/20 max-w-3xl mx-auto p-4">
        <div className="h-3 w-24 bg-gray-300 mb-3 animate-pulse" />
        <div className="h-2 w-72 bg-gray-200 mb-6 animate-pulse" />
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square bg-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}
