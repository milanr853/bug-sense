import React from 'react';

// --- Helper Function ---

/**
 * Calculates text color for a given OKLCH string.
 * @param oklchColor - e.g., "oklch(71.5% 0.143 215.221)"
 * @returns 'text-black' or 'text-white'
 */
function getTextColorForOklch(oklchColor: string): 'text-black' | 'text-white' {
    try {
        // Extracts the "L" value (lightness)
        const lightness = parseFloat(oklchColor.split('%')[0].split('(')[1]);
        // OKLCH Lightness is 0-100. Use black text on lighter backgrounds.
        return lightness > 60 ? 'text-black' : 'text-white';
    } catch (e) {
        console.error("Could not parse OKLCH string:", oklchColor, e);
        return 'text-white'; // Default to white
    }
}

// --- Color Definitions ---

// 1. For Tailwind: Use underscores _ instead of spaces in arbitrary values
const colorClasses = {
    blue: 'bg-[oklch(70.7%_0.165_254.624)] hover:bg-[oklch(62.3%_0.214_259.815)]',
    green: 'bg-[oklch(79.2%_0.209_151.711)]   hover:bg-[oklch(72.3%_0.219_149.579)]',
    purple: 'bg-[oklch(71.4%_0.203_305.504)]  hover:bg-[oklch(62.7%_0.265_303.9)]',
    red: 'bg-[oklch(70.4%_0.191_22.216)]  hover:bg-[oklch(63.7%_0.237_25.331)]',
    slate: 'bg-[oklch(70.4%_0.04_256.788)] hover:bg-[oklch(55.4%_0.046_257.417)]',

    dark: 'bg-[oklch(59.6%_0.145_163.225)] hover:bg-[oklch(50.8%_0.118_165.612)]',
}

// 2. For Text-Contrast Helper: Use normal spaces
const baseColors = {
    blue: 'oklch(70.7% 0.165 254.624)',
    green: 'oklch(79.2% 0.209 151.711)',
    purple: 'oklch(71.4% 0.203 305.504)',
    red: 'oklch(70.4% 0.191 22.216)',
    slate: 'oklch(70.4% 0.04 256.788)',

    dark: 'oklch(59.6% 0.145 163.225)',
}

// Define the type for your color prop (adjust as needed)
type ButtonColor = 'blue' | 'green' | 'purple' | 'red' | 'slate' | 'dark';

// --- Prop Interface ---

interface buttonProps {
    name: string,
    title?: string,
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void,
    color: ButtonColor, // Use our specific color type
    disable?: boolean
}

// --- Component ---

function DisplayButton({ name, title = "", onClick = () => { }, color = "slate", disable = false }: buttonProps) {

    // 1. Look up the Tailwind class string
    const buttonColorClasses = colorClasses[color];

    // 2. Look up the base color and get the correct text color
    const baseOklch = baseColors[color];
    const textColorClass = getTextColorForOklch(baseOklch);

    return (
        <button
            onClick={onClick}
            className={`
                w-full py-2 rounded-lg transition text-base
                ${buttonColorClasses}
                ${textColorClass}
                ${disable ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            title={title}
            disabled={disable}
        >
            {name}
        </button>
    )
}

export default DisplayButton;