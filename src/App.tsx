import React, { useState, useEffect } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ZAxis } from 'recharts';
import { Droplets, Cloud, Snowflake, TrendingUp, AlertCircle, RotateCcw } from 'lucide-react';
import Papa from 'papaparse';

const LakePowellInflowTool = () => {
  const [historicalData, setHistoricalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [sweApr1Pct, setSweApr1Pct] = useState(100);
  const [fallSMPct, setFallSMPct] = useState(100);
  const [springPrecipPct, setSpringPrecipPct] = useState(100);
  const [forecastedFlowPct, setForecastedFlowPct] = useState(100);
  const [forecastedFlowMM, setForecastedFlowMM] = useState(0);
  const [analogYears, setAnalogYears] = useState([]);
  const [regressionBeta, setRegressionBeta] = useState([0, 0, 0]);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Fetch from public directory - Vite serves public assets from root
        const response = await fetch('/water_year_metrics.csv');
        
        if (!response.ok) {
          throw new Error(`Failed to load CSV file: ${response.statusText}`);
        }
        
        const csvText = await response.text();
        
        Papa.parse(csvText, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
          complete: (results) => {
            const data = results.data.filter(d => d.water_year);
            
            const baselineData = data.filter(d => d.water_year >= 1991 && d.water_year <= 2020);
            
            const means = {
              swe: baselineData.reduce((sum, d) => sum + d.apr1_swe_mm, 0) / baselineData.length,
              fallSM: baselineData.reduce((sum, d) => sum + d.fall_sm_oct_nov_avg_mm, 0) / baselineData.length,
              springPrecip: baselineData.reduce((sum, d) => sum + d.spring_precip_apr_jul_mm, 0) / baselineData.length,
              streamflow: baselineData.reduce((sum, d) => sum + d.total_streamflow_mm, 0) / baselineData.length
            };
            
            const processedData = data.map(d => ({
              year: d.water_year,
              swe_mm: d.apr1_swe_mm,
              fallSM_mm: d.fall_sm_oct_nov_avg_mm,
              springPrecip_mm: d.spring_precip_apr_jul_mm,
              streamflow_mm: d.total_streamflow_mm,
              swe_pct: (d.apr1_swe_mm / means.swe) * 100,
              fallSM_pct: (d.fall_sm_oct_nov_avg_mm / means.fallSM) * 100,
              springPrecip_pct: (d.spring_precip_apr_jul_mm / means.springPrecip) * 100,
              streamflow_pct: (d.total_streamflow_mm / means.streamflow) * 100
            }));
            
            const ranges = {
              swe_pct: {
                min: Math.min(...processedData.map(d => d.swe_pct)),
                max: Math.max(...processedData.map(d => d.swe_pct)),
                mean: 100
              },
              fallSM_pct: {
                min: Math.min(...processedData.map(d => d.fallSM_pct)),
                max: Math.max(...processedData.map(d => d.fallSM_pct)),
                mean: 100
              },
              springPrecip_pct: {
                min: Math.min(...processedData.map(d => d.springPrecip_pct)),
                max: Math.max(...processedData.map(d => d.springPrecip_pct)),
                mean: 100
              },
              streamflow_pct: {
                min: Math.min(...processedData.map(d => d.streamflow_pct)),
                max: Math.max(...processedData.map(d => d.streamflow_pct)),
                mean: 100
              }
            };
            
            const createHistogram = (values, numBins = 15) => {
              const min = Math.min(...values);
              const max = Math.max(...values);
              const binWidth = (max - min) / numBins;
              const bins = Array(numBins).fill(0);
              
              values.forEach(v => {
                const binIndex = Math.min(Math.floor((v - min) / binWidth), numBins - 1);
                bins[binIndex]++;
              });
              
              return bins.map((count, i) => ({
                value: min + (i + 0.5) * binWidth,
                count: count,
                binStart: min + i * binWidth,
                binEnd: min + (i + 1) * binWidth
              }));
            };
            
            const histograms = {
              swe: createHistogram(processedData.map(d => d.swe_pct)),
              fallSM: createHistogram(processedData.map(d => d.fallSM_pct)),
              springPrecip: createHistogram(processedData.map(d => d.springPrecip_pct)),
              streamflow: createHistogram(processedData.map(d => d.streamflow_pct))
            };
            
            setHistoricalData({
              years: processedData,
              means: means,
              ranges: ranges,
              histograms: histograms
            });
            setForecastedFlowMM(means.streamflow);
            setLoading(false);
          },
          error: (err) => {
            setError(`Error parsing CSV: ${err.message}`);
            setLoading(false);
          }
        });
      } catch (err) {
        setError(`Error loading file: ${err.message}. Make sure water_year_metrics.csv is in the public folder.`);
        setLoading(false);
      }
    };
    
    loadData();
  }, []);

  useEffect(() => {
    if (!historicalData) return;
    const { years, means, ranges } = historicalData;
    
    const X = years.map(y => [
      y.swe_pct - 100,
      y.fallSM_pct - 100,
      y.springPrecip_pct - 100
    ]);
    const Y = years.map(y => y.streamflow_pct - 100);
    
    const n = X.length;
    let beta = [0, 0, 0];
    
    for (let i = 0; i < 3; i++) {
      let sumXY = 0, sumX2 = 0;
      for (let j = 0; j < n; j++) {
        sumXY += X[j][i] * Y[j];
        sumX2 += X[j][i] * X[j][i];
      }
      beta[i] = sumX2 > 0 ? sumXY / sumX2 : 0;
    }
    
    setRegressionBeta(beta);
    
    const sweContrib = (sweApr1Pct - 100) * beta[0];
    const fallContrib = (fallSMPct - 100) * beta[1];
    const springContrib = (springPrecipPct - 100) * beta[2];
    
    const forecastPct = Math.max(
      ranges.streamflow_pct.min,
      Math.min(ranges.streamflow_pct.max, 100 + sweContrib + fallContrib + springContrib)
    );
    
    setForecastedFlowPct(forecastPct);
    setForecastedFlowMM((forecastPct / 100) * means.streamflow);

    const analogs = years.filter(y => 
      Math.abs(y.swe_pct - sweApr1Pct) <= 15 &&
      Math.abs(y.fallSM_pct - fallSMPct) <= 15 &&
      Math.abs(y.springPrecip_pct - springPrecipPct) <= 15
    ).sort((a, b) => b.streamflow_mm - a.streamflow_mm).slice(0, 5);
    
    setAnalogYears(analogs);
  }, [sweApr1Pct, fallSMPct, springPrecipPct, historicalData]);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length > 0) {
      const data = payload[0].payload;
      const isForecast = data.year === 'Forecast';
      
      if (isForecast) {
        return (
          <div className="bg-white p-4 border-2 border-red-500 rounded-lg shadow-lg">
            <p className="font-bold text-red-600">Current Forecast</p>
            <p className="text-sm">SWE: {sweApr1Pct.toFixed(0)}% of avg</p>
            <p className="text-sm">Fall SM: {fallSMPct.toFixed(0)}% of avg</p>
            <p className="text-sm">Spring Precip: {springPrecipPct.toFixed(0)}% of avg</p>
            <p className="font-semibold mt-2">Streamflow: {forecastedFlowPct.toFixed(0)}% of avg</p>
          </div>
        );
      }
      
      const sweContrib = data.swe_pct - 100;
      const fallContrib = data.fallSM_pct - 100;
      const springContrib = data.springPrecip_pct - 100;
      
      return (
        <div className="bg-white p-4 border-2 border-blue-500 rounded-lg shadow-lg">
          <p className="font-bold text-lg mb-2">WY {data.year}</p>
          <div className="space-y-1 text-sm">
            <p>
              <span className="font-semibold">SWE:</span> {sweContrib >= 0 ? '+' : ''}{sweContrib.toFixed(1)}%
            </p>
            <p>
              <span className="font-semibold">Fall SM:</span> {fallContrib >= 0 ? '+' : ''}{fallContrib.toFixed(1)}%
            </p>
            <p>
              <span className="font-semibold">Spring Precip:</span> {springContrib >= 0 ? '+' : ''}{springContrib.toFixed(1)}%
            </p>
          </div>
          <p className="font-semibold mt-2 pt-2 border-t">
            Streamflow: {data.streamflow_pct.toFixed(0)}% of avg
          </p>
          <p className="text-xs text-gray-600 mt-1">
            ({data.streamflow_mm.toFixed(1)} mm)
          </p>
        </div>
      );
    }
    return null;
  };

  const SliderWithHistogram = ({ label, value, onChange, min, max, histogram, icon: Icon, color }) => {
    const maxCount = Math.max(...histogram.map(d => d.count));
    
    return (
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className={`w-5 h-5 ${color}`} />
            <label className="font-semibold text-gray-700">{label}</label>
          </div>
          <span className="text-lg font-bold text-gray-900">{Math.round(value)}%</span>
        </div>
        
        <div className="relative h-12 mb-1">
          <div className="absolute inset-0 flex items-end justify-stretch">
            {histogram.map((bin, idx) => {
              const height = (bin.count / maxCount) * 100;
              const left = ((bin.binStart - min) / (max - min)) * 100;
              const width = ((bin.binEnd - bin.binStart) / (max - min)) * 100;
              
              return (
                <div
                  key={idx}
                  className="absolute bg-blue-200 opacity-40"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    height: `${height}%`,
                    bottom: 0
                  }}
                />
              );
            })}
          </div>
          
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
            style={{ left: `${((value - min) / (max - min)) * 100}%` }}
          >
            <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-500 rounded-full"></div>
          </div>
        </div>
        
        <input
          type="range"
          min={min}
          max={max}
          step="0.5"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{Math.round(min)}%</span>
          <span>100% (1991-2020 Avg)</span>
          <span>{Math.round(max)}%</span>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading VIC model data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Error Loading Data</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  const { years, means, ranges, histograms } = historicalData;
  
  const getColor = (springPrecipPct) => {
    const normalized = (springPrecipPct - ranges.springPrecip_pct.min) / 
                      (ranges.springPrecip_pct.max - ranges.springPrecip_pct.min);
    
    if (normalized < 0.25) {
      const t = normalized / 0.25;
      return `rgb(${Math.round(215 + 40 * t)}, ${Math.round(48 + 62 * t)}, ${Math.round(39 - 9 * t)})`;
    } else if (normalized < 0.5) {
      const t = (normalized - 0.25) / 0.25;
      return `rgb(${Math.round(255 - 5 * t)}, ${Math.round(110 + 110 * t)}, ${Math.round(30 + 20 * t)})`;
    } else if (normalized < 0.75) {
      const t = (normalized - 0.5) / 0.25;
      return `rgb(${Math.round(250 - 180 * t)}, ${Math.round(220 - 20 * t)}, ${Math.round(50 + 150 * t)})`;
    } else {
      const t = (normalized - 0.75) / 0.25;
      return `rgb(${Math.round(70 - 40 * t)}, ${Math.round(200 - 80 * t)}, ${Math.round(200 + 40 * t)})`;
    }
  };

  const getSizeScale = (fallSMPct) => {
    const normalized = (fallSMPct - ranges.fallSM_pct.min) / 
                      (ranges.fallSM_pct.max - ranges.fallSM_pct.min);
    return 100 + normalized * 300;
  };

  const sweContribution = sweApr1Pct - 100;
  const fallContribution = fallSMPct - 100;
  const springContribution = springPrecipPct - 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 p-6">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            Lake Powell Inflow Forecasting Tool
          </h1>
          <p className="text-gray-600">
            Upper Colorado River Basin VIC Model (1985-2024, Baseline: 1991-2020)
          </p>
          <p className="text-sm text-red-600 font-semibold mt-1">
            INTERNAL BETA VERSION - FOR DEVELOPMENT AND TESTING ONLY
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Input Parameters</h2>
              <button
                onClick={() => {
                  setSweApr1Pct(100);
                  setFallSMPct(100);
                  setSpringPrecipPct(100);
                }}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                title="Reset all to 100%"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>
            </div>
            
            <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Quick Select Historical Year
              </label>
              <select
                className="w-full p-2 border border-gray-300 rounded-lg bg-white text-gray-700 font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onChange={(e) => {
                  if (e.target.value === '') return;
                  const selectedYear = years.find(y => y.year === parseInt(e.target.value));
                  if (selectedYear) {
                    setSweApr1Pct(selectedYear.swe_pct);
                    setFallSMPct(selectedYear.fallSM_pct);
                    setSpringPrecipPct(selectedYear.springPrecip_pct);
                  }
                }}
                defaultValue=""
              >
                <option value="">-- Select a water year --</option>
                {years.map(year => (
                  <option key={year.year} value={year.year}>
                    WY {year.year} ({Math.round(year.streamflow_pct)}%)
                  </option>
                ))}
              </select>
            </div>
            
            <SliderWithHistogram
              label="April 1st SWE"
              value={sweApr1Pct}
              onChange={setSweApr1Pct}
              min={ranges.swe_pct.min}
              max={ranges.swe_pct.max}
              histogram={histograms.swe}
              icon={Snowflake}
              color="text-blue-500"
            />
            <SliderWithHistogram
              label="Fall Soil Moisture (Oct-Nov)"
              value={fallSMPct}
              onChange={setFallSMPct}
              min={ranges.fallSM_pct.min}
              max={ranges.fallSM_pct.max}
              histogram={histograms.fallSM}
              icon={Droplets}
              color="text-amber-600"
            />
            <SliderWithHistogram
              label="Spring Precipitation (Apr-Jul)"
              value={springPrecipPct}
              onChange={setSpringPrecipPct}
              min={ranges.springPrecip_pct.min}
              max={ranges.springPrecip_pct.max}
              histogram={histograms.springPrecip}
              icon={Cloud}
              color="text-cyan-500"
            />

            <div className="mt-8 p-6 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-6 h-6" />
                <h3 className="text-lg font-semibold">Forecasted Inflow</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="col-span-2 text-center pb-4 border-b border-white/30">
                  <div className="text-4xl font-bold mb-1">
                    {Math.round(forecastedFlowPct)}%
                  </div>
                  <div className="text-sm opacity-90">
                    of 1991-2020 average
                  </div>
                  <div className="text-2xl font-semibold mt-2">
                    {forecastedFlowMM.toFixed(1)} mm
                  </div>
                  <div className="text-xs opacity-75">
                    Baseline: {means.streamflow.toFixed(1)} mm
                  </div>
                </div>
                
                <div className="col-span-2">
                  <div className="text-xs font-semibold mb-2 opacity-90">Factor Contributions:</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <div className={`text-lg font-bold ${sweContribution >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                        {sweContribution >= 0 ? '+' : ''}{sweContribution.toFixed(0)}%
                      </div>
                      <div className="text-xs opacity-75">SWE</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-lg font-bold ${fallContribution >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                        {fallContribution >= 0 ? '+' : ''}{fallContribution.toFixed(0)}%
                      </div>
                      <div className="text-xs opacity-75">Fall SM</div>
                    </div>
                    <div className="text-center">
                      <div className={`text-lg font-bold ${springContribution >= 0 ? 'text-green-200' : 'text-red-200'}`}>
                        {springContribution >= 0 ? '+' : ''}{springContribution.toFixed(0)}%
                      </div>
                      <div className="text-xs opacity-75">Spring P</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-4">
                SWE vs Streamflow Relationship
              </h2>
              <div className="mb-4 flex items-center gap-6 text-sm flex-wrap">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: 'rgb(215, 48, 39)' }}></div>
                  <span>Dry Spring</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: 'rgb(250, 220, 50)' }}></div>
                  <span>Normal Spring</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: 'rgb(30, 120, 240)' }}></div>
                  <span>Wet Spring</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                  <span className="mr-2">Small</span>
                  <div className="w-4 h-4 rounded-full bg-gray-600"></div>
                  <span>Large = High Fall SM</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={500}>
                <ScatterChart margin={{ top: 20, right: 30, bottom: 60, left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="swe_pct" 
                    type="number"
                    domain={[
                      Math.floor(ranges.swe_pct.min / 25) * 25,
                      Math.ceil(ranges.swe_pct.max / 25) * 25
                    ]}
                    ticks={(() => {
                      const min = Math.floor(ranges.swe_pct.min / 25) * 25;
                      const max = Math.ceil(ranges.swe_pct.max / 25) * 25;
                      const ticks = [];
                      for (let i = min; i <= max; i += 25) {
                        ticks.push(i);
                      }
                      if (!ticks.includes(100)) {
                        ticks.push(100);
                        ticks.sort((a, b) => a - b);
                      }
                      return ticks;
                    })()}
                    label={{ value: 'April 1st SWE (% of 1991-2020 average)', position: 'insideBottom', offset: -10, style: { fontSize: 14, fontWeight: 600 } }}
                  />
                  <YAxis 
                    dataKey="streamflow_pct"
                    domain={[
                      Math.floor(ranges.streamflow_pct.min / 25) * 25,
                      Math.ceil(ranges.streamflow_pct.max / 25) * 25
                    ]}
                    ticks={(() => {
                      const min = Math.floor(ranges.streamflow_pct.min / 25) * 25;
                      const max = Math.ceil(ranges.streamflow_pct.max / 25) * 25;
                      const ticks = [];
                      for (let i = min; i <= max; i += 25) {
                        ticks.push(i);
                      }
                      if (!ticks.includes(100)) {
                        ticks.push(100);
                        ticks.sort((a, b) => a - b);
                      }
                      return ticks;
                    })()}
                    label={{ value: 'Annual Streamflow (% of 1991-2020 average)', angle: -90, position: 'insideLeft', style: { fontSize: 14, fontWeight: 600 } }}
                  />
                  <ZAxis dataKey="size" range={[100, 400]} />
                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine x={100} stroke="#666" strokeWidth={2} />
                  <ReferenceLine y={100} stroke="#666" strokeWidth={2} />
                  
                  {years.map((year) => (
                    <Scatter
                      key={year.year}
                      data={[{ ...year, size: getSizeScale(year.fallSM_pct) }]}
                      fill={getColor(year.springPrecip_pct)}
                      fillOpacity={0.6}
                      shape="circle"
                    />
                  ))}
                  
                  <Scatter
                    data={[{
                      year: 'Forecast',
                      swe_pct: sweApr1Pct,
                      streamflow_pct: forecastedFlowPct,
                      size: getSizeScale(fallSMPct)
                    }]}
                    fill="#ef4444"
                    shape="star"
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">Methodology & Information</h2>
          
          <div className="space-y-6 text-gray-700">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Forecasting Model</h3>
              <p className="mb-3">
                This tool uses a multiple linear regression model to forecast annual streamflow in the Upper Colorado River Basin 
                based on three key hydrological indicators. The model is trained on 40 years (1985-2024) of VIC (Variable Infiltration Capacity) 
                model simulations, with all percentages calculated relative to the 1991-2020 baseline period.
              </p>
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="font-semibold mb-2">Regression Equation:</p>
                <p className="font-mono text-sm">
                  Streamflow% = 100 + β₁×(SWE% - 100) + β₂×(FallSM% - 100) + β₃×(SpringPrecip% - 100)
                </p>
                <p className="text-sm mt-3">
                  Where β₁, β₂, and β₃ are regression coefficients derived from historical data using ordinary least squares estimation. 
                  The coefficients represent the sensitivity of streamflow to each predictor variable.
                </p>
                <div className="mt-3 text-sm">
                  <p className="font-semibold">Current Model Coefficients:</p>
                  <p>β₁ (SWE) = {regressionBeta[0].toFixed(4)}</p>
                  <p>β₂ (Fall SM) = {regressionBeta[1].toFixed(4)}</p>
                  <p>β₃ (Spring Precip) = {regressionBeta[2].toFixed(4)}</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Input Variables</h3>
              <ul className="space-y-2 list-disc list-inside">
                <li><strong>April 1st Snow Water Equivalent (SWE):</strong> Measure of snowpack water content on April 1st, 
                    representing the winter snowpack accumulation that will contribute to spring runoff.</li>
                <li><strong>Fall Soil Moisture (Oct-Nov):</strong> Two-month average soil moisture from October to November, 
                    indicating antecedent watershed conditions that modulate snowmelt-runoff efficiency.</li>
                <li><strong>Spring Precipitation (Apr-Jul):</strong> Cumulative precipitation during the April-July period, 
                    capturing spring storm activity that supplements snowmelt runoff.</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Scatter Plot Interpretation</h3>
              <p className="mb-2">
                The SWE vs. Streamflow plot displays historical relationships with additional context:
              </p>
              <ul className="space-y-1 list-disc list-inside">
                <li><strong>Symbol Color:</strong> Spectral colormap representing spring precipitation (red = dry, yellow = normal, blue = wet)</li>
                <li><strong>Symbol Size:</strong> Proportional to fall soil moisture (larger = wetter antecedent conditions)</li>
                <li><strong>Red Star:</strong> Current forecast scenario based on your input parameters</li>
                <li><strong>Reference Lines:</strong> Solid lines at 100% indicate 1991-2020 baseline average conditions</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Reference</h3>
              <p className="text-sm bg-gray-50 p-3 rounded border border-gray-200">
                Ghimire, S., Vivoni, E.R., and Wang, Z. 2026. Fall Soil Moisture Modulates Snow-Streamflow Dynamics 
                in the Colorado River Basin. <em>Water Resources Research</em>. (In Review).
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Contact</h3>
              <p>
                For questions, comments, or feedback, please contact:{' '}
                <a 
                  href="mailto:zwang307@asu.edu?subject=Lake Powell Inflow Forecasting Tool Feedback"
                  className="text-blue-600 hover:text-blue-800 underline font-medium"
                >
                  Dr. Zhaocheng Wang (zwang307@asu.edu)
                </a>
              </p>
            </div>

            <div className="border-t pt-4 mt-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Disclaimer & Copyright</h3>
              <div className="text-sm space-y-2 text-gray-600">
                <p>
                  <strong>Copyright © 2026 Arizona State University.</strong> This tool is provided for research and educational purposes only.
                </p>
                <p>
                  <strong>INTERNAL BETA VERSION:</strong> This is a development version intended for testing and validation. 
                  Results should not be used for operational water management decisions without proper verification.
                </p>
                <p>
                  <strong>Waiver of Responsibility:</strong> This forecasting tool is provided "as is" without warranty of any kind, 
                  either expressed or implied. The developers and Arizona State University make no representations or warranties 
                  regarding the accuracy, completeness, or reliability of the forecasts. Users assume all risk and responsibility 
                  for the use of this tool and any decisions made based on its outputs. Under no circumstances shall the developers 
                  or Arizona State University be liable for any direct, indirect, incidental, special, or consequential damages 
                  arising from the use of this tool.
                </p>
                <p>
                  <strong>Data Source:</strong> VIC model simulations (1985-2024) of the Upper Colorado River Basin. 
                  All percentages are calculated relative to 1991-2020 baseline period averages.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LakePowellInflowTool;
