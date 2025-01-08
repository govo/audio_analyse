import { useEffect, useRef, useLayoutEffect } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption, TooltipComponentFormatterCallbackParams } from 'echarts';

interface FrequencyData {
  frequencies: number[];
  magnitudes: number[];
  name: string;
}

interface Props {
  data: FrequencyData[];
}

const FrequencyChart = ({ data }: Props) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts>();

  // 初始化图表
  useLayoutEffect(() => {
    if (!chartRef.current) {
      console.warn('Chart container not found');
      return;
    }

    console.log('Initializing chart with container size:', {
      width: chartRef.current.clientWidth,
      height: chartRef.current.clientHeight
    });

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
      console.log('Chart instance created');
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = undefined;
        console.log('Chart instance disposed');
      }
    };
  }, []);

  // 更新图表数据
  useEffect(() => {
    if (!chartInstance.current) {
      console.warn('Chart instance not found');
      return;
    }

    console.log('Updating chart with data:', {
      dataLength: data.length,
      firstItem: data[0] ? {
        freqLength: data[0].frequencies.length,
        magLength: data[0].magnitudes.length,
        name: data[0].name
      } : null
    });

    // 数据验证
    if (!Array.isArray(data) || data.length === 0) {
      const emptyOption: EChartsOption = {
        title: {
          text: '频响曲线',
          left: 'center'
        },
        tooltip: {
          trigger: 'axis'
        },
        grid: {
          left: '5%',
          right: '5%',
          bottom: '10%',
          top: '15%',
          containLabel: true
        },
        xAxis: {
          type: 'log',
          name: '频率 (Hz)',
          min: 20,
          max: 20000,
          axisLabel: {
            formatter: (value: number) => {
              if (value >= 1000) {
                return `${(value/1000).toFixed(0)}k`;
              }
              return value.toFixed(0);
            }
          }
        },
        yAxis: {
          type: 'value',
          name: '幅度 (dB)',
          min: -40,
          max: 0,
          axisLabel: {
            formatter: '{value}'
          }
        },
        graphic: [{
          type: 'text',
          left: 'center',
          top: 'middle',
          style: {
            text: '请上传音频文件以查看频响曲线',
            fill: '#999',
            fontSize: 14
          }
        }]
      };
      chartInstance.current.setOption(emptyOption, true);
      return;
    }

    const validData = data.filter(item => 
      item.frequencies.length > 0 && 
      item.magnitudes.length > 0 && 
      item.frequencies.length === item.magnitudes.length
    );

    if (validData.length === 0) {
      console.warn('No valid data for frequency response chart');
      return;
    }

    // 处理数据点
    const series = validData.map(item => {
      // 确保数据点按频率排序
      const dataPoints = item.frequencies.map((freq, index) => ({
        freq,
        mag: item.magnitudes[index]
      })).sort((a, b) => a.freq - b.freq);

      // 对数区间采样
      const sampledData: [number, number][] = [];
      const freqBands = [
        { min: 20, max: 100, points: 200 },    // 20-100Hz, 200点
        { min: 100, max: 1000, points: 300 },  // 100Hz-1kHz, 300点
        { min: 1000, max: 10000, points: 200 }, // 1kHz-10kHz, 200点
        { min: 10000, max: 20000, points: 100 } // 10kHz-20kHz, 100点
      ];

      freqBands.forEach(band => {
        const bandPoints = dataPoints.filter(p => p.freq >= band.min && p.freq <= band.max);
        if (bandPoints.length > 0) {
          const step = Math.max(1, Math.floor(bandPoints.length / band.points));
          const sampledBandPoints = bandPoints.filter((_, index) => index % step === 0)
            .map(point => [point.freq, point.mag] as [number, number]);
          sampledData.push(...sampledBandPoints);
        }
      });

      console.log(`Processed series ${item.name}:`, {
        originalPoints: dataPoints.length,
        sampledPoints: sampledData.length,
        freqRange: [sampledData[0][0], sampledData[sampledData.length - 1][0]],
        magRange: [
          Math.min(...sampledData.map(p => p[1])),
          Math.max(...sampledData.map(p => p[1]))
        ]
      });

      return {
        name: item.name,
        type: 'line',
        data: sampledData,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 2
        }
      };
    });

    const option: EChartsOption = {
      title: {
        text: '频响曲线',
        left: 'center'
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: TooltipComponentFormatterCallbackParams | TooltipComponentFormatterCallbackParams[]) => {
          const p = Array.isArray(params) ? params[0] : params;
          const data = p.data as [number, number];
          return `${p.seriesName}<br/>
                 频率: ${data[0].toFixed(1)}Hz<br/>
                 幅度: ${data[1].toFixed(1)}dB`;
        }
      },
      legend: {
        data: validData.map(item => item.name),
        top: 30,
        type: 'scroll',
        width: '80%'
      },
      grid: {
        left: '5%',
        right: '5%',
        bottom: '10%',
        top: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'log',
        name: '频率 (Hz)',
        nameLocation: 'center',
        nameGap: 25,
        min: 20,
        max: 20000,
        splitLine: {
          show: true,
          lineStyle: {
            type: 'dashed',
            opacity: 0.3
          }
        },
        axisLabel: {
          formatter: (value: number) => {
            if (value >= 1000) {
              return `${(value/1000).toFixed(0)}k`;
            }
            return value.toFixed(0);
          }
        }
      },
      yAxis: {
        type: 'value',
        name: '幅度 (dB)',
        nameLocation: 'center',
        nameGap: 30,
        min: -40,
        max: 0,
        interval: 5,
        splitLine: {
          show: true,
          lineStyle: {
            type: 'dashed',
            opacity: 0.3
          }
        },
        axisLabel: {
          formatter: (value: number) => value.toFixed(0)
        }
      },
      series: series.map(s => ({
        ...s,
        smooth: true,
        symbol: 'none',
        lineStyle: {
          width: 2
        },
        emphasis: {
          focus: 'series',
          lineStyle: {
            width: 3
          }
        }
      })),
      animation: false,
      toolbox: {
        feature: {
          dataZoom: {
            yAxisIndex: 'none'
          },
          restore: {},
          saveAsImage: {}
        },
        right: 20
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'none',
          minValueSpan: 100
        }
      ]
    };

    try {
      chartInstance.current.setOption(option, true);
      console.log('Chart option updated successfully');
    } catch (error) {
      console.error('Failed to update chart:', error);
    }
  }, [data]);

  // 处理窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      if (chartInstance.current && chartRef.current) {
        const { clientWidth, clientHeight } = chartRef.current;
        console.log('Resizing chart to:', { clientWidth, clientHeight });
        chartInstance.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);
    // 初始调用一次以确保正确的大小
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div 
      ref={chartRef} 
      style={{ 
        width: '100%', 
        height: '400px',
        border: '1px solid #f0f0f0'
      }} 
    />
  );
};

export default FrequencyChart; 