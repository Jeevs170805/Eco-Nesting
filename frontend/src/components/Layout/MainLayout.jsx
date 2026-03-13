import React from 'react';
import Sidebar from './Sidebar';

const MainLayout = ({ children, currentStep, setStep, nestingMode }) => {
    const showSidebar = nestingMode !== null;

    return (
        <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
            {showSidebar && <Sidebar currentStep={currentStep} setStep={setStep} nestingMode={nestingMode} />}
            <main className="flex-1 flex flex-col h-full overflow-hidden relative">
                <header className="h-16 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md flex items-center px-6 justify-between z-10">
                    <h1 className="text-xl font-bold tracking-tight text-white">Eco-Nesting</h1>
                    {showSidebar && <div className="text-xs text-slate-400 uppercase font-black tracking-widest">{nestingMode} Mode • Step {currentStep} of 4</div>}
                </header>
                <div className="flex-1 overflow-auto p-0 relative">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default MainLayout;
