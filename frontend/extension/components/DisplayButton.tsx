import React from 'react'

interface buttonProps {
    name: string,
    title?: string,
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void, // Improved onClick type
    color?: 'black' | 'blue' | 'red' | 'green' | 'purple' | 'slate', // Tip: Use specific types
    disable?: boolean
}

// 1. Define the color map
// Tailwind can see these full strings and will generate the CSS
const colorVariants = {
    black: 'bg-black hover:bg-gray-800',

    blue: 'bg-blue-500 hover:bg-blue-600',
    red: 'bg-red-500 hover:bg-red-600',
    green: 'bg-green-500 hover:bg-green-600',
    slate: 'bg-slate-500 hover:bg-slate-600',
    purple: 'bg-purple-500 hover:bg-purple-600',
}

function DisplayButton({ name, title = "", onClick = () => { }, color = "black", disable = false }: buttonProps) {

    // 2. Look up the classes based on the prop
    const buttonColorClasses = colorVariants[color] || colorVariants.black;

    return (
        <button
            onClick={onClick} // Pass the event directly
            // 3. Combine static and dynamic classes
            className={`
                w-full text-white py-2 rounded-lg transition
                ${buttonColorClasses}
                ${disable ? 'opacity-50 cursor-not-allowed' : ''}
            `}
            title={title}
            disabled={disable}
        >
            {name}
        </button>
    )
}

export default DisplayButton