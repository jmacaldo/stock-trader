export default function LoadingScreen() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-bold text-lg">
          P
        </div>
        <div className="w-5 h-5 border-2 border-gray-700 border-t-emerald-500 rounded-full animate-spin" />
        <p className="text-gray-600 text-xs">Loading your account…</p>
      </div>
    </div>
  )
}
