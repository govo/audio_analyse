import { useEffect, useRef, useLayoutEffect } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

interface DynamicsData {
  overall_dynamics: {
    range: number;
    percentiles: {
      "10": number;
      "25": number;
      "50": number;
      "75": number;
      "90": number;
    };
  };
  band_dynamics: Array<{
    band: string;
    dynamic_range: number;
    percentiles: {
      "10": number;
      "50": number;
      "90": number;
    };
  }>;
  short_term_dynamics: {
    frame_duration_ms: number;
    values: number[];
  };
}

interface Props {
  data: Array<{
    name: string;
    dynamics: DynamicsData;
  }>;
}

const DynamicsChart = ({ data }: Props) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts>();

  // 初始化图表
  useLayoutEffect(() => {
    if (!chartRef.current) {
      console.warn('Chart container not found');
      return;
    }

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
      console.log('Dynamics chart instance created');
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = undefined;
        console.log('Dynamics chart instance disposed');
      }
    };
  }, []);

  // 更新图表数据
  useEffect(() => {
    if (!chartInstance.current) {
      console.warn('Chart instance not found');
      return;
    }

    if (!data || data.length === 0) {
      const emptyOption: EChartsOption = {
        title: [
          {
            text: '频段动态范围分析',
            left: 'center',
            top: 0
          },
          {
            text: '短时动态范围',
            left: 'center',
            top: '55%'
          }
        ],
        grid: [
          {
            top: '15%',
            bottom: '55%',
            containLabel: true
          },
          {
            top: '65%',
            bottom: '5%',
            containLabel: true
          }
        ],
        xAxis: [
          {
            type: 'category',
            gridIndex: 0,
            data: ['20-100Hz', '100-500Hz', '500-2000Hz', '2000-8000Hz', '8000-20000Hz'],
            axisLabel: {
              interval: 0,
              rotate: 30
            }
          },
          {
            type: 'category',
            gridIndex: 1,
            data: []
          }
        ],
        yAxis: [
          {
            type: 'value',
            name: '幅度 (dB)',
            gridIndex: 0
          },
          {
            type: 'value',
            name: '幅度 (dB)',
            gridIndex: 1
          }
        ],
        graphic: [{
          type: 'text',
          left: 'center',
          top: 'middle',
          style: {
            text: '请上传音频文件以查看动态范围分析',
            fill: '#999',
            fontSize: 14
          }
        }]
      };
      chartInstance.current.setOption(emptyOption);
      return;
    }

    // 生成频段动态范围数据系列
    const bandSeries = data.map(item => {
      const dynamicRanges = item.dynamics.band_dynamics.map(band => band.dynamic_range);
      return [
        {
          name: `${item.name} - 动态范围`,
          type: 'bar',
          data: dynamicRanges,
          xAxisIndex: 0,
          yAxisIndex: 0,
          itemStyle: {
            opacity: 0.8
          },
          label: {
            show: true,
            position: 'top',
            formatter: '{c}dB'
          }
        },
        {
          name: `${item.name} - 百分位`,
          type: 'custom',
          renderItem: (params: echarts.CustomSeriesRenderItemParams, api: echarts.CustomSeriesRenderItemAPI) => {
            const xValue = api.value(0);
            const low = api.value(1);
            const mid = api.value(2);
            const high = api.value(3);
            
            const coordsLow = api.coord([xValue, low]);
            const coordsMid = api.coord([xValue, mid]);
            const coordsHigh = api.coord([xValue, high]);
            
            return {
              type: 'group',
              children: [
                {
                  type: 'line',
                  shape: {
                    x1: coordsLow[0],
                    y1: coordsLow[1],
                    x2: coordsHigh[0],
                    y2: coordsHigh[1]
                  },
                  style: {
                    stroke: api.visual('color'),
                    lineWidth: 2
                  }
                },
                {
                  type: 'line',
                  shape: {
                    x1: coordsLow[0] - 5,
                    y1: coordsLow[1],
                    x2: coordsLow[0] + 5,
                    y2: coordsLow[1]
                  },
                  style: {
                    stroke: api.visual('color'),
                    lineWidth: 2
                  }
                },
                {
                  type: 'line',
                  shape: {
                    x1: coordsHigh[0] - 5,
                    y1: coordsHigh[1],
                    x2: coordsHigh[0] + 5,
                    y2: coordsHigh[1]
                  },
                  style: {
                    stroke: api.visual('color'),
                    lineWidth: 2
                  }
                },
                {
                  type: 'circle',
                  shape: {
                    cx: coordsMid[0],
                    cy: coordsMid[1],
                    r: 3
                  },
                  style: {
                    fill: api.visual('color'),
                    stroke: '#fff',
                    lineWidth: 1
                  }
                }
              ]
            };
          },
          dimensions: [
            'band',
            'percentile10',
            'percentile50',
            'percentile90'
          ],
          encode: {
            x: 0,
            y: [1, 2, 3]
          },
          data: item.dynamics.band_dynamics.map(band => [
            band.band,
            band.percentiles["10"],
            band.percentiles["50"],
            band.percentiles["90"]
          ]),
          xAxisIndex: 0,
          yAxisIndex: 0
        }
      ];
    }).flat();

    // 生成短时动态范围数据系列
    const shortTermSeries = data.map(item => ({
      name: `${item.name} - 短时动态范围`,
      type: 'line',
      data: item.dynamics.short_term_dynamics.values,
      xAxisIndex: 1,
      yAxisIndex: 1,
      lineStyle: {
        width: 1
      },
      symbol: 'none',
      areaStyle: {
        opacity: 0.1
      }
    }));

    const option: EChartsOption = {
      title: [
        {
          text: '频段动态范围分析',
          left: 'center',
          top: 0
        },
        {
          text: '短时动态范围',
          left: 'center',
          top: '55%'
        }
      ],
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        }
      },
      legend: [
        {
          data: data.map(item => [
            `${item.name} - 动态范围`,
            `${item.name} - 百分位`,
            `${item.name} - 短时动态范围`
          ]).flat(),
          top: 25,
          type: 'scroll',
          width: '80%'
        }
      ],
      grid: [
        {
          top: '15%',
          bottom: '55%',
          containLabel: true
        },
        {
          top: '65%',
          bottom: '5%',
          containLabel: true
        }
      ],
      xAxis: [
        {
          type: 'category',
          data: data[0].dynamics.band_dynamics.map(band => band.band),
          gridIndex: 0,
          axisLabel: {
            interval: 0,
            rotate: 30
          }
        },
        {
          type: 'category',
          gridIndex: 1,
          data: Array.from(
            { length: data[0].dynamics.short_term_dynamics.values.length },
            (_, i) => (i * data[0].dynamics.short_term_dynamics.frame_duration_ms / 1000).toFixed(1)
          )
        }
      ],
      yAxis: [
        {
          type: 'value',
          name: '幅度 (dB)',
          gridIndex: 0
        },
        {
          type: 'value',
          name: '幅度 (dB)',
          gridIndex: 1
        }
      ],
      series: [...bandSeries, ...shortTermSeries],
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
      }
    };

    try {
      chartInstance.current.setOption(option, true);
      console.log('Dynamics chart updated successfully');
    } catch (error) {
      console.error('Failed to update dynamics chart:', error);
    }
  }, [data]);

  // 处理窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      if (chartInstance.current && chartRef.current) {
        chartInstance.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);
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
        height: '600px',
        border: '1px solid #f0f0f0',
        position: 'relative'
      }} 
    />
  );
};

export default DynamicsChart; 