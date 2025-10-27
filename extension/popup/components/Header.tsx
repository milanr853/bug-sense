import React from "react";

export default function Header() {
  return (
    <div className="flex items-center justify-between border-b pb-2">
      <h1 className="text-lg font-bold text-gray-800">Bug Sense</h1>
      <span className="text-xs text-gray-500">v1.0.0</span>
    </div>
  );
}

