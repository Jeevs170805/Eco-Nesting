import React from 'react';
import { Layout, Shapes, ArrowRight } from 'lucide-react';

const ModeSelection = ({ onSelect }) => {
    return (
        <div className="flex flex-col items-center justify-center min-h-full p-6 bg-slate-950">
            <div className="text-center mb-12">
                <h1 className="text-4xl font-black text-white mb-4">Select Nesting Mode</h1>
                <p className="text-slate-400">Choose the type of fabric you want to optimize for.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl w-full">
                {/* Regular Mode */}
                <button
                    onClick={() => onSelect('regular')}
                    className="group bg-slate-900 p-8 rounded-[2.5rem] border-2 border-slate-800 hover:border-sky-500/50 text-left transition-all hover:shadow-2xl hover:shadow-sky-500/10"
                >
                    <div className="w-16 h-16 bg-sky-500/10 rounded-2xl flex items-center justify-center text-sky-500 mb-6 group-hover:scale-110 transition-transform">
                        <Layout className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-black text-white mb-2">Roll / Rectangular Fabric</h2>
                    <p className="text-sm text-slate-500 leading-relaxed mb-8">
                        Optimize for standard fabric rolls or rectangular sheets with fixed width and length.
                    </p>
                    <div className="flex items-center gap-2 text-sky-500 font-bold text-sm uppercase tracking-widest">
                        Start Standard Flow <ArrowRight className="w-4 h-4" />
                    </div>
                </button>

                {/* Irregular Mode */}
                <button
                    onClick={() => onSelect('irregular')}
                    className="group bg-slate-900 p-8 rounded-[2.5rem] border-2 border-slate-800 hover:border-emerald-500/50 text-left transition-all hover:shadow-2xl hover:shadow-emerald-500/10"
                >
                    <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500 mb-6 group-hover:scale-110 transition-transform">
                        <Shapes className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-black text-white mb-2">Irregular Scrap Fabric</h2>
                    <p className="text-sm text-slate-500 leading-relaxed mb-8">
                        Upload a photo of any irregular fabric scrap. Our AI will detect its contour and nest inside it.
                    </p>
                    <div className="flex items-center gap-2 text-emerald-500 font-bold text-sm uppercase tracking-widest">
                        Start Irregular Flow <ArrowRight className="w-4 h-4" />
                    </div>
                </button>
            </div>
        </div>
    );
};

export default ModeSelection;
