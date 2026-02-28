import React from 'react';

export default function Modal({ isVisible, onClose, title, children }) {
    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold">{title}</h3>
                    <button onClick={onClose} className="text-black text-2xl">&times;</button>
                </div>
                <div>
                    {children}
                </div>
            </div>
        </div>
    );
} 