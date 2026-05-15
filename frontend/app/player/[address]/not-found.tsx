export default function PlayerNotFound() {
  return (
    <div className="min-h-screen p-4 bg-[#3a6ea5] text-white">
      <div className="bg-[#ece9d8] text-black border border-black/20 max-w-xl mx-auto p-4">
        <h1 className="text-lg font-bold mb-2">Player not found</h1>
        <p className="text-sm">
          That doesn&apos;t look like a valid Stacks address.
        </p>
        <p className="mt-3">
          <a href="/" className="text-blue-700 underline text-sm">
            ← Back to desktop
          </a>
        </p>
      </div>
    </div>
  );
}
