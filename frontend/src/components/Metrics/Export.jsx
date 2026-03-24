import React, { useRef, useEffect, useState } from 'react';
import { Download, FileJson, CheckCircle, FileText, ChevronLeft, Share2 } from 'lucide-react';
import * as fabric from 'fabric';

const Export = ({ layout, clothConfig, shapes, onBack, onHome, nestingMode }) => {
    const canvasRef = useRef(null);
    const [stats, setStats] = useState({ efficiency: 0, usedArea: 0 });

    useEffect(() => {
        if (!canvasRef.current || !layout?.items) return;

        const width = 500;
        const height = 400;

        const canvas = new fabric.StaticCanvas(canvasRef.current, {
            width,
            height,
            backgroundColor: '#020617'
        });

        // Use clothConfig and layout.metrics to determine scale
        const padding = 20;
        const vScale = Math.min((width - padding) / clothConfig.width, (height - padding) / clothConfig.height);
        const offsetX = (width - clothConfig.width * vScale) / 2;
        const offsetY = (height - clothConfig.height * vScale) / 2;

        // Cloth Background
        canvas.add(new fabric.Rect({
            left: offsetX,
            top: offsetY,
            width: clothConfig.width * vScale,
            height: clothConfig.height * vScale,
            fill: '#0f172a',
            stroke: '#1e293b',
            strokeWidth: 1,
            selectable: false
        }));

        // If in irregular mode, draw the boundary polygon
        if (clothConfig.boundaryPoints && nestingMode === 'irregular') {
            const boundaryPoints = clothConfig.boundaryPoints.map(pt => ({
                x: offsetX + pt[0] * vScale,
                y: offsetY + pt[1] * vScale
            }));
            const boundary = new fabric.Polygon(boundaryPoints, {
                fill: 'transparent',
                stroke: '#eab308', // Yellow
                strokeWidth: 2,
                selectable: false,
                evented: false
            });
            canvas.add(boundary);
        }

        // Render Min-Cut Polygon/Rectangle
        if (layout.metrics?.minCutPoints) {
            const mcPoints = layout.metrics.minCutPoints.map(pt => ({
                x: offsetX + pt[0] * vScale,
                y: offsetY + pt[1] * vScale
            }));
            canvas.add(new fabric.Polygon(mcPoints, {
                fill: 'rgba(16, 185, 129, 0.05)',
                stroke: '#10b981', // Green
                strokeWidth: 2,
                strokeDashArray: [5, 5],
                selectable: false
            }));
        } else if (layout.metrics?.usedWidth) {
            // Rectangular fallback
            canvas.add(new fabric.Rect({
                left: offsetX,
                top: offsetY,
                width: layout.metrics.usedWidth * vScale,
                height: layout.metrics.usedHeight * vScale,
                fill: 'rgba(16, 185, 129, 0.05)',
                stroke: '#10b981', // Green
                strokeWidth: 2,
                strokeDashArray: [5, 5],
                selectable: false
            }));
        }

        // Render leftover areas if available
        if (layout.leftoverPolygons) {
            layout.leftoverPolygons.forEach(p => {
                const pts = p.map(pt => ({
                    x: offsetX + pt[0] * vScale,
                    y: offsetY + pt[1] * vScale
                }));
                const leftover = new fabric.Polygon(pts, {
                    fill: 'rgba(16, 185, 129, 0.05)',
                    stroke: 'none',
                    selectable: false,
                    evented: false
                });
                canvas.add(leftover);
            });
        }

        // Render optimized items
        layout.items.forEach(p => {
            const gridPoints = p.points.map(pt => ({
                x: pt.x * vScale,
                y: pt.y * vScale
            }));

            const poly = new fabric.Polygon(gridPoints.map(pt => ({ x: pt.x + offsetX, y: pt.y + offsetY })), {
                fill: '#0ea5e9',
                stroke: '#ffffff',
                strokeWidth: 1,
                selectable: false
            });
            canvas.add(poly);
        });

        if (layout.metrics) {
            setStats({
                efficiency: layout.metrics.efficiency,
                usedArea: layout.metrics.usedPieceArea
            });
        }

        canvas.requestRenderAll();
        return () => canvas.dispose();
    }, [layout, clothConfig, shapes]);

    const handleExportPNG = () => {
        const dataURL = canvasRef.current.toDataURL({ format: 'png', quality: 1 });
        const link = document.createElement('a');
        link.download = 'eco-nest-layout.png';
        link.href = dataURL;
        link.click();

        // Return to home after download
        setTimeout(() => onHome(), 1000);
    };

    const handleExportJSON = () => {
        const exportData = {
            cloth: clothConfig,
            shapes: layout.items.map(p => {
                return { ...p };
            }),
            stats
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
        const link = document.createElement('a');
        link.download = 'layout-data.json';
        link.href = dataStr;
        link.click();

        // Return to home after download
        setTimeout(() => onHome(), 1000);
    };


    return (
        <div className="flex flex-col items-center justify-center min-h-full p-6 bg-slate-950">
            <div className="bg-slate-900 p-8 rounded-3xl shadow-2xl border border-slate-800 max-w-5xl w-full flex flex-col md:flex-row gap-10">

                <div className="flex-1 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <button onClick={onBack} className="text-slate-500 hover:text-white flex items-center gap-1 text-sm transition-colors">
                            <ChevronLeft className="w-4 h-4" /> Back to Adjust
                        </button>
                        <span className="text-[10px] bg-sky-500/10 text-sky-400 px-2 py-1 rounded font-bold uppercase tracking-widest">Final Preview</span>
                    </div>
                    <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800 shadow-inner flex items-center justify-center">
                        <canvas ref={canvasRef} className="max-w-full" />
                    </div>
                </div>

                <div className="w-full md:w-80 flex flex-col gap-8">
                    <div className="text-center md:text-left">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 mb-4">
                            <CheckCircle className="w-7 h-7" />
                        </div>
                        <h2 className="text-2xl font-black text-white leading-tight">Layout Optimized!</h2>
                        <p className="text-sm text-slate-400 mt-1">Ready for marking and cutting.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                            <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Efficiency</div>
                            <div className="text-xl font-black text-emerald-400">{stats.efficiency.toFixed(1)}%</div>
                        </div>
                        <div className="p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                            <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Pieces</div>
                            <div className="text-xl font-black text-white">
                                {layout?.items?.length || shapes?.length || 0}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                            <Share2 className="w-3 h-3" /> Export Options
                        </h3>
                        <button onClick={handleExportPNG} className="w-full py-3.5 bg-sky-500 hover:bg-sky-400 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-sky-500/20">
                            <Download className="w-5 h-5" /> Download PNG Image
                        </button>
                        <button onClick={handleExportJSON} className="w-full py-3.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all border border-slate-700">
                            <FileJson className="w-5 h-5 text-amber-400" /> Save as JSON Data
                        </button>
                    </div>

                    <div className="mt-auto p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/10">
                        <p className="text-[11px] text-emerald-500/70 text-center italic">
                            "Sustainable cutting starts with a smart layout."
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Export;

