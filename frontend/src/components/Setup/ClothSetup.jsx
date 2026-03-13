import React, { useState } from 'react';

const ClothSetup = ({ onNext }) => {
    const [config, setConfig] = useState({
        width: 100,
        height: 100,
        scale: 10
    });

    return (
        <div className="flex flex-col items-center justify-center p-10 h-full">
            <div className="bg-slate-900 rounded-xl p-8 border border-slate-800 shadow-2xl max-w-md w-full">
                <div className="mb-6 text-center">
                    <h2 className="text-2xl font-bold text-white">Step 1: Background Cloth Setup</h2>
                    <p className="text-sm text-slate-400 mt-2">Define your fabric dimensions and grid scale.</p>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Cloth Width (cm)</label>
                        <input
                            type="number"
                            value={config.width}
                            onChange={(e) => setConfig({ ...config, width: Number(e.target.value) })}
                            className="w-full bg-slate-800 border-slate-700 rounded-lg py-2 px-3 text-white focus:ring-2 focus:ring-sky-500 outline-none"
                            placeholder="e.g. 100"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Cloth Height (cm)</label>
                        <input
                            type="number"
                            value={config.height}
                            onChange={(e) => setConfig({ ...config, height: Number(e.target.value) })}
                            className="w-full bg-slate-800 border-slate-700 rounded-lg py-2 px-3 text-white focus:ring-2 focus:ring-sky-500 outline-none"
                            placeholder="e.g. 100"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Scale Size / Grid Size (cm)</label>
                        <div className="text-[10px] text-slate-500 mb-1">Each grid square will be this size.</div>
                        <input
                            type="number"
                            value={config.scale}
                            onChange={(e) => setConfig({ ...config, scale: Number(e.target.value) })}
                            className="w-full bg-slate-800 border-slate-700 rounded-lg py-2 px-3 text-white focus:ring-2 focus:ring-sky-500 outline-none"
                            placeholder="e.g. 10"
                        />
                    </div>

                    <div className="pt-4 border-t border-slate-800 mt-6 text-xs text-slate-500">
                        <p>Total Cloth Area: {(config.width * config.height).toLocaleString()} cm²</p>
                        <p>Grid: {Math.ceil(config.width / config.scale)} × {Math.ceil(config.height / config.scale)} cells</p>
                    </div>

                    <button
                        onClick={() => onNext(config)}
                        className="w-full mt-4 bg-sky-500 hover:bg-sky-400 text-white font-bold py-3 px-4 rounded-lg transition-all shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2"
                    >
                        Save & Continue to Step 2
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ClothSetup;
