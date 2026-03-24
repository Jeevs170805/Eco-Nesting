import React, { useState } from 'react';
import MainLayout from './components/Layout/MainLayout';
import ClothSetup from './components/Setup/ClothSetup';
import UploadCalibrate from './components/Setup/UploadCalibrate';
import Optimization from './components/Canvas/Optimization';
import Export from './components/Metrics/Export';
import ModeSelection from './components/Setup/ModeSelection';
import FabricCalibrate from './components/Setup/FabricCalibrate';

function App() {
    const [nestingMode, setNestingMode] = useState(null); // 'regular', 'irregular'
    const [currentStep, setStep] = useState(0);
    const [clothConfig, setClothConfig] = useState({ width: 100, height: 100, scale: 10, boundaryPoints: null });
    const [shapes, setShapes] = useState([]);
    const [layout, setLayout] = useState([]);

    const handleModeSelect = (mode) => {
        setNestingMode(mode);
        if (mode === 'regular') {
            setClothConfig(prev => ({ ...prev, boundaryPoints: null }));
        }
        setStep(1);
    };

    const handleClothSetup = (config) => {
        setClothConfig(prev => ({ ...prev, ...config }));
        setStep(2);
    };

    const handleCalibrationComplete = (data) => {
        if (data) setShapes(data);
        setStep(3);
    };

    const handleFabricCalibration = (data) => {
        setClothConfig(prev => ({ ...prev, ...data }));
        setStep(2);
    };

    // Helper to map currentStep to the active component based on mode
    const renderStep = () => {
        if (nestingMode === null) {
            return <ModeSelection onSelect={handleModeSelect} />;
        }

        if (nestingMode === 'regular') {
            switch (currentStep) {
                case 1: return <ClothSetup onNext={handleClothSetup} />;
                case 2: return <UploadCalibrate clothConfig={clothConfig} onNext={handleCalibrationComplete} setShapes={setShapes} />;
                case 3: return <Optimization clothConfig={clothConfig} shapes={shapes} onNext={() => setStep(4)} setLayout={setLayout} nestingMode={nestingMode} />;
                case 4: return <Export layout={layout} clothConfig={clothConfig} shapes={shapes} onBack={() => setStep(3)} onHome={() => { setNestingMode(null); setStep(0); }} nestingMode={nestingMode} />;
                default: return <ModeSelection onSelect={handleModeSelect} />;
            }
        } else {
            // Irregular flow: ModeSelect (0) -> FabricCalibrate (1) -> UploadCalibrate pieces (2) -> Optimization (3) -> Export (4)
            switch (currentStep) {
                case 1: return <FabricCalibrate onNext={handleFabricCalibration} />;
                case 2: return <UploadCalibrate clothConfig={clothConfig} onNext={handleCalibrationComplete} setShapes={setShapes} />;
                case 3: return <Optimization clothConfig={clothConfig} shapes={shapes} onNext={() => setStep(4)} setLayout={setLayout} nestingMode={nestingMode} />;
                case 4: return <Export layout={layout} clothConfig={clothConfig} shapes={shapes} onBack={() => setStep(3)} onHome={() => { setNestingMode(null); setStep(0); }} nestingMode={nestingMode} />;
                default: return <ModeSelection onSelect={handleModeSelect} />;
            }
        }
    };

    return (
        <MainLayout currentStep={currentStep} setStep={setStep} nestingMode={nestingMode}>
            {renderStep()}
        </MainLayout>
    );
}

export default App;
