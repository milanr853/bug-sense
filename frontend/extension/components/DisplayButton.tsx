import React from 'react'

interface buttonProps {
    name: string,
    title?: string,
    onClick?: any | null,
    color?: string,
    disable?: boolean
}

function DisplayButton({ name, title = "", onClick = () => { }, color = "black", disable = false }: buttonProps) {
    return (
        <button
            onClick={() => onClick ? onClick() : ""}
            className={`w-full bg-${color}-400 hover:bg-${color}-500 text-white py-2 rounded-lg transition`}
            title={title}
            disabled={disable}
        >
            {name}
        </button>
    )
}

export default DisplayButton