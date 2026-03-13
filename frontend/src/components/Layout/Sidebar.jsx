import React from 'react';
import { Layers, Scissors, Settings, Save, LayoutGrid, Upload, MousePointerClick } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const Sidebar = ({ currentStep, setStep, nestingMode }) => {
    const regularSteps = [
        { id: 1, name: 'Setup Cloth', icon: Settings },
        { id: 2, name: 'Upload & Calibrate', icon: Upload },
        { id: 3, name: 'Optimization', icon: LayoutGrid },
        { id: 4, name: 'Export', icon: Save },
    ];

    const irregularSteps = [
        { id: 1, name: 'Fabric Setup', icon: Settings },
        { id: 2, name: 'Layout Pieces', icon: Upload },
        { id: 3, name: 'Optimization', icon: LayoutGrid },
        { id: 4, name: 'Export', icon: Save },
    ];

    const steps = nestingMode === 'regular' ? regularSteps : irregularSteps;

    return (
        <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full z-20 shadow-xl">
            <div className="h-16 flex items-center justify-center border-b border-slate-800">
                <div className="flex items-center gap-2 text-accent">
                    <Scissors className="w-6 h-6" />
                    <span className="font-bold text-xl tracking-wider text-white">ECO NEST</span>
                </div>
            </div>

            <nav className="flex-1 p-4 space-y-2">
                {steps.map((step) => {
                    const Icon = step.icon;
                    const isActive = currentStep === step.id;
                    const isCompleted = currentStep > step.id;

                    return (
                        <button
                            key={step.id}
                            disabled={!isCompleted && !isActive}
                            onClick={() => setStep(step.id)}
                            className={twMerge(
                                clsx(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 text-sm font-medium",
                                    isActive
                                        ? "bg-sky-500/10 text-sky-400 shadow-[0_0_15px_rgba(14,165,233,0.15)] border border-sky-500/20"
                                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200",
                                    isCompleted && !isActive && "text-slate-300",
                                    (!isCompleted && !isActive) && "opacity-50 cursor-not-allowed"
                                )
                            )}
                        >
                            <Icon className={clsx("w-5 h-5", isActive ? "text-sky-500" : "text-slate-500")} />
                            <span>{step.name}</span>
                            {isCompleted && (
                                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            )}
                        </button>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-slate-800">
                <div className="bg-slate-800/50 rounded-lg p-3 text-xs text-slate-400">
                    <p className="font-semibold text-slate-300 mb-1 capitalize">{nestingMode} Mode</p>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        System Ready
                    </div>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;
