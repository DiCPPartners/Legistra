// Logo SVG per myMD - stetoscopio professionale, ottimizzato per piccole dimensioni
export default function Logo({ className = "h-6 w-6", color = "white" }) {
  const isWhite = color === "white"
  // Quando color="white", usa il colore bianco direttamente
  const stethColor = isWhite ? "white" : color
  const primaryColor = "#2f9aa7"
  const secondaryColor = "#3eb8a8"
  
  return (
    <svg
      viewBox="0 0 40 40"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Stetoscopio - parte superiore (testa/diaframma) - più grande e visibile */}
      <ellipse
        cx="20"
        cy="10"
        rx="6"
        ry="5"
        fill={stethColor}
        opacity={isWhite ? "1" : "0.95"}
      />
      
      {/* Tubo principale che scende - più spesso */}
      <path
        d="M 20 15 L 20 25"
        stroke={stethColor}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        opacity={isWhite ? "1" : "0.95"}
      />
      
      {/* Biforcazione del tubo - più semplice e visibile */}
      <path
        d="M 20 25 L 14 30"
        stroke={stethColor}
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
        opacity={isWhite ? "1" : "0.95"}
      />
      <path
        d="M 20 25 L 26 30"
        stroke={stethColor}
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
        opacity={isWhite ? "1" : "0.95"}
      />
      
      {/* Cuffia sinistra - più grande */}
      <circle
        cx="14"
        cy="30"
        r="5"
        fill={stethColor}
        opacity={isWhite ? "1" : "0.95"}
      />
      <circle
        cx="14"
        cy="30"
        r="3"
        fill={isWhite ? "#2f9aa7" : "white"}
        opacity={isWhite ? "0.3" : "0.6"}
      />
      
      {/* Cuffia destra - più grande */}
      <circle
        cx="26"
        cy="30"
        r="5"
        fill={stethColor}
        opacity={isWhite ? "1" : "0.95"}
      />
      <circle
        cx="26"
        cy="30"
        r="3"
        fill={isWhite ? "#2f9aa7" : "white"}
        opacity={isWhite ? "0.3" : "0.6"}
      />
      
      {/* Connettore centrale - più visibile */}
      <circle
        cx="20"
        cy="25"
        r="2.5"
        fill={stethColor}
        opacity={isWhite ? "1" : "0.95"}
      />
    </svg>
  )
}
