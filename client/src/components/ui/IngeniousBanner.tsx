interface IngeniousBannerProps {
  small?: boolean
}

export default function IngeniousBanner({ small = false }: IngeniousBannerProps) {
  if (small) {
    return (
      <span className="font-bold text-purple-300 tracking-wide text-lg">
        Ingenious
      </span>
    )
  }

  return (
    <div className="text-center">
      <h1 className="text-5xl font-extrabold tracking-tight">
        {'Ingenious'.split('').map((char, i) => {
          const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#f97316', '#eab308']
          return (
            <span key={i} style={{ color: colors[i % colors.length] }}>
              {char}
            </span>
          )
        })}
      </h1>
      <p className="text-gray-400 mt-1 text-sm">The hex tile strategy game</p>
    </div>
  )
}
