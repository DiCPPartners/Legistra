export default function ModeSelector({ options, selectedMode, onChange, disabled = false }) {
  const handleModeChange = (modeId) => {
    onChange(modeId === selectedMode ? null : modeId);
  };

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {options.map((option) => {
        const isActive = selectedMode === option.id
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => handleModeChange(option.id)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
              isActive
                ? 'border-[#4fb3c1] bg-[#e1eff2] text-[#308f9d] shadow-[0_12px_32px_rgba(79,179,193,0.2)]'
                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700'
            } disabled:cursor-not-allowed disabled:opacity-60`}
            disabled={disabled}
            title={option.description}
          >
            <div className="text-left">
              <p className="text-sm font-semibold leading-none">{option.label}</p>
              <p className={`mt-2 text-xs leading-relaxed ${isActive ? 'text-slate-600' : 'text-slate-400 group-hover:text-slate-500'}`}>
                {option.description}
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

