// Logo SVG per Legistra - bilancia della giustizia professionale, ottimizzato per piccole dimensioni
export default function Logo({ className = "h-6 w-6", color = "white" }) {
  const isWhite = color === "white"
  const scaleColor = isWhite ? "white" : color
  const primaryColor = "#2f9aa7"
  
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Pilastro centrale */}
      <path
        d="M 20 6 L 20 34"
        stroke={scaleColor}
        strokeWidth="3"
        strokeLinecap="round"
        opacity={isWhite ? "1" : "0.95"}
      />
      
      {/* Base */}
      <path
        d="M 13 34 L 27 34"
        stroke={scaleColor}
        strokeWidth="3"
        strokeLinecap="round"
        opacity={isWhite ? "1" : "0.95"}
      />
      
      {/* Braccio orizzontale */}
      <path
        d="M 8 12 L 32 12"
        stroke={scaleColor}
        strokeWidth="3"
        strokeLinecap="round"
        opacity={isWhite ? "1" : "0.95"}
      />
      
      {/* Piatto sinistro - catene */}
      <path
        d="M 8 12 L 5 22"
        stroke={scaleColor}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={isWhite ? "0.8" : "0.75"}
      />
      <path
        d="M 8 12 L 11 22"
        stroke={scaleColor}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={isWhite ? "0.8" : "0.75"}
      />
      
      {/* Piatto sinistro */}
      <path
        d="M 3 22 Q 8 26 13 22"
        stroke={scaleColor}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity={isWhite ? "1" : "0.95"}
      />
      
      {/* Piatto destro - catene */}
      <path
        d="M 32 12 L 29 22"
        stroke={scaleColor}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={isWhite ? "0.8" : "0.75"}
      />
      <path
        d="M 32 12 L 35 22"
        stroke={scaleColor}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={isWhite ? "0.8" : "0.75"}
      />
      
      {/* Piatto destro */}
      <path
        d="M 27 22 Q 32 26 37 22"
        stroke={scaleColor}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity={isWhite ? "1" : "0.95"}
      />
      
      {/* Cerchio superiore */}
      <circle
        cx="20"
        cy="8"
        r="3"
        fill={scaleColor}
        opacity={isWhite ? "1" : "0.95"}
      />
      <circle
        cx="20"
        cy="8"
        r="1.5"
        fill={isWhite ? primaryColor : "white"}
        opacity={isWhite ? "0.3" : "0.6"}
      />
    </svg>
  )
}
