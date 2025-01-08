import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

interface BandDynamics {
  band: string;
  dynamic_range: {
    fast: number;
    slow: number;
  };
  percentiles: {
    fast: {
      "10": number;
      "25": number;
      "50": number;
      "75": number;
      "90": number;
    };
    slow: {
      "10": number;
      "25": number;
      "50": number;
      "75": number;
      "90": number;
    };
  };
}

interface Dynamics {
  overall_dynamics: {
    fast: {
      range: number;
      percentiles: {
        "10": number;
        "25": number;
        "50": number;
        "75": number;
        "90": number;
      };
    };
    slow: {
      range: number;
      percentiles: {
        "10": number;
        "25": number;
        "50": number;
        "75": number;
        "90": number;
      };
    };
  };
  true_peak_level: number;
  crest_factor: number;
  band_dynamics: BandDynamics[];
  short_term_dynamics: {
    frame_duration_ms: number;
    values: number[];
  };
}

interface Props {
  data: Array<{
    name: string;
    dynamics: Dynamics;
  }>;
}

interface CustomSeriesRenderItemParams {
  dataIndex: number;
  value: number[];
}

interface CustomSeriesRenderItemAPI {
  value: (dim: number) => number;
  coord: (point: number[]) => number[];
  visual: (key: string) => string;
}

interface TooltipParams {
  axisValue: string;
  seriesName: string;
  value: number;
  seriesType: string;
  axisIndex: number;
  color: string;
}

const DynamicsChart = ({ data }: Props) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts>();

  // 初始化图表实例
  useEffect(() => {
    // 确保DOM元素存在
    if (!chartRef.current) {
      return;
    }

    // 创建图表实例
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }

    // 处理窗口大小变化
    const handleResize = () => {
      chartInstance.current?.resize();
    };

    window.addEventListener('resize', handleResize);

    // 清理函数
    return () => {
      window.removeEventListener('resize', handleResize);
      // 只在组件卸载时销毁图表实例
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = undefined;
      }
    };
  }, []); // 只在组件挂载时执行

  // 更新图表数据
  useEffect(() => {
    // 确保图表实例存在
    if (!chartInstance.current) {
      if (chartRef.current) {
        chartInstance.current = echarts.init(chartRef.current);
      } else {
        console.warn('Chart container not found');
        return;
      }
    }

    // 添加数据验证
    console.log('Received data:', data);

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
            data: [],
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
        }],
        tooltip: {
          show: false
        }
      };
      try {
        chartInstance.current.setOption(emptyOption, true);
      } catch (error) {
        console.error('Failed to set empty option:', error);
      }
      return;
    }

    try {
      // 生成频段动态范围数据系列
      const bandSeries: echarts.SeriesOption[] = [];
      
      // 定义基础颜色
      const baseColors = [
        ['#1890ff', '#69c0ff'], // 蓝色系
        ['#52c41a', '#95de64'], // 绿色系
        ['#722ed1', '#b37feb'], // 紫色系
        ['#fa8c16', '#ffc069'], // 橙色系
        ['#eb2f96', '#ff85c0'], // 粉色系
        ['#13c2c2', '#5cdbd3'], // 青色系
        ['#f5222d', '#ff7875'], // 红色系
        ['#fadb14', '#fff566']  // 黄色系
      ];

      // 创建文件名到颜色的映射
      const fileColors = new Map(
        data.map((item, index) => [
          item.name, 
          baseColors[index % baseColors.length]
        ])
      );

      // 计算每个文件的柱状图位置偏移
      const barWidth = Math.max(5, 80 / (data.length * 2)); // 每个柱子的宽度，最小5%
      const barGap = '30%'; // 同组柱子之间的间距（Fast和Slow之间）
      const barCategoryGap = '50%'; // 不同组之间的间距

      data.forEach((item, dataIndex) => {
        console.log('Processing item:', item.name, item.dynamics);
        
        // 获取当前数据的颜色对
        const [brightColor, lightColor] = baseColors[dataIndex % baseColors.length];

        // Fast响应数据系列
        const fastData = item.dynamics.band_dynamics.map(band => ({
          value: band.dynamic_range.fast,
          itemStyle: {
            color: brightColor,
            opacity: 0.9
          }
        }));
        console.log('Fast response data:', fastData);

        bandSeries.push({
          name: item.name,
          type: 'bar',
          data: fastData,
          xAxisIndex: 0,
          yAxisIndex: 0,
          barWidth: `${barWidth}%`,
          barGap,
          barCategoryGap,
          label: {
            show: false
          },
          itemStyle: {
            color: brightColor,
            opacity: 0.9
          }
        });

        // Slow响应数据系列
        const slowData = item.dynamics.band_dynamics.map(band => ({
          value: band.dynamic_range.slow,
          itemStyle: {
            color: lightColor,
            opacity: 0.9
          }
        }));
        console.log('Slow response data:', slowData);

        bandSeries.push({
          name: item.name,
          type: 'bar',
          data: slowData,
          xAxisIndex: 0,
          yAxisIndex: 0,
          barWidth: `${barWidth}%`,
          barGap,
          barCategoryGap,
          label: {
            show: false
          },
          itemStyle: {
            color: lightColor,
            opacity: 0.9
          }
        });

        // 百分位数据系列
        const percentileData = item.dynamics.band_dynamics.map(band => ({
          name: band.band,
          low: band.percentiles.fast["10"],
          high: band.percentiles.fast["90"]
        }));
        console.log('Percentile data:', percentileData);

        // 使用error bar显示百分位范围
        bandSeries.push({
          name: item.name,
          type: 'custom',
          renderItem: (params: CustomSeriesRenderItemParams, api: CustomSeriesRenderItemAPI) => {
            const data = percentileData[params.dataIndex];
            const basePosition = api.coord([params.dataIndex, (data.high + data.low) / 2]);
            const height = api.coord([params.dataIndex, data.high])[1] - api.coord([params.dataIndex, data.low])[1];
            const barOffset = (dataIndex - (data.length - 1) / 2) * barWidth * 1.5;
            
            return {
              type: 'group',
              children: [
                {
                  type: 'line',
                  shape: {
                    x1: basePosition[0] + barOffset,
                    y1: basePosition[1] - height / 2,
                    x2: basePosition[0] + barOffset,
                    y2: basePosition[1] + height / 2
                  },
                  style: {
                    stroke: brightColor,
                    lineWidth: 2
                  }
                },
                {
                  type: 'line',
                  shape: {
                    x1: basePosition[0] + barOffset - 4,
                    y1: basePosition[1] - height / 2,
                    x2: basePosition[0] + barOffset + 4,
                    y2: basePosition[1] - height / 2
                  },
                  style: {
                    stroke: brightColor,
                    lineWidth: 2
                  }
                },
                {
                  type: 'line',
                  shape: {
                    x1: basePosition[0] + barOffset - 4,
                    y1: basePosition[1] + height / 2,
                    x2: basePosition[0] + barOffset + 4,
                    y2: basePosition[1] + height / 2
                  },
                  style: {
                    stroke: brightColor,
                    lineWidth: 2
                  }
                }
              ]
            };
          },
          data: percentileData,
          xAxisIndex: 0,
          yAxisIndex: 0,
          z: 100
        });
      });

      // 生成短时动态范围数据系列
      const shortTermSeries = data.map((item, index) => {
        console.log('Short-term dynamics:', item.name, item.dynamics.short_term_dynamics);
        const [color] = baseColors[index % baseColors.length];
        return {
          name: item.name,
          type: 'line',
          data: item.dynamics.short_term_dynamics.values,
          xAxisIndex: 1,
          yAxisIndex: 1,
          showSymbol: false,
          lineStyle: {
            width: 1.5,
            color: color
          }
        };
      });

      const option: EChartsOption = {
        title: [
          {
            text: '频段动态范围分析',
            left: 'center',
            top: 0,
            subtext: '(Fast/Slow响应)'
          },
          {
            text: '短时动态范围',
            left: 'center',
            top: '55%',
            subtext: `(${data[0].dynamics.short_term_dynamics.frame_duration_ms}ms窗口)`
          }
        ],
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'cross'
          },
          formatter: (params: TooltipParams | TooltipParams[]) => {
            if (Array.isArray(params)) {
              const bandName = params[0].axisValue;
              
              // 检查是否是上方图表（频段动态范围）
              if (params[0]?.axisIndex === 0) {
                let result = `<div style="font-weight:bold;margin-bottom:5px;">频率：${bandName}</div>`;
                
                // 只处理bar类型的series
                params.forEach((param, index) => {
                  if (param.seriesType === 'bar') {
                    const colors = fileColors.get(param.seriesName) || ['#333', '#333'];
                    const responseType = index % 2 === 0 ? 'Fast' : 'Slow';
                    const color = index % 2 === 0 ? colors[0] : colors[1];
                    result += `<div style="color:${color};padding-left:10px;">
                      ${param.seriesName} (${responseType})：${param.value.toFixed(1)}dB
                    </div>`;
                  }
                });
                return result;
              } else {
                // 下方图表（短时动态范围）的tooltip
                let result = `<div style="font-weight:bold;margin-bottom:5px;">时间：${bandName}秒</div>`;
                params.forEach(param => {
                  const colors = fileColors.get(param.seriesName) || ['#333', '#333'];
                  result += `<div style="color:${colors[0]};padding-left:10px;">
                    ${param.seriesName}：${param.value.toFixed(1)}dB
                  </div>`;
                });
                return result;
              }
            }
            return '';
          }
        },
        legend: {
          type: 'scroll',
          top: 50,
          textStyle: {
            fontSize: 12
          },
          selected: data.reduce((acc, item) => ({
            ...acc,
            [item.name]: true
          }), {}),
          formatter: (name: string) => name,
          selectedMode: 'multiple',
          selector: [
            {
              type: 'all',
              title: '全选'
            },
            {
              type: 'inverse',
              title: '反选'
            }
          ]
        },
        grid: [
          {
            top: '20%',
            bottom: '55%',
            containLabel: true,
            left: '5%',
            right: '5%'
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
            data: data[0].dynamics.band_dynamics.map(band => band.band),
            axisLabel: {
              interval: 2,
              rotate: 45,
              fontSize: 10,
              formatter: (value: string) => {
                return value.replace('Hz', '');
              }
            },
            axisTick: {
              alignWithLabel: true
            }
          },
          {
            type: 'category',
            gridIndex: 1,
            data: Array.from({ length: data[0].dynamics.short_term_dynamics.values.length }, 
              (_, i) => (i * data[0].dynamics.short_term_dynamics.frame_duration_ms / 1000).toFixed(1)),
            name: '时间 (秒)'
          }
        ],
        yAxis: [
          {
            type: 'value',
            name: '幅度 (dB)',
            gridIndex: 0,
            splitLine: {
              show: true,
              lineStyle: {
                type: 'dashed'
              }
            }
          },
          {
            type: 'value',
            name: '幅度 (dB)',
            gridIndex: 1
          }
        ],
        dataZoom: [
          {
            type: 'inside',
            xAxisIndex: [0],
            start: 0,
            end: 100,
            zoomLock: false
          },
          {
            type: 'slider',
            xAxisIndex: [0],
            top: '50%',
            height: 20,
            start: 0,
            end: 100
          }
        ],
        series: [...bandSeries, ...shortTermSeries],
        animation: true,
        animationDuration: 500
      };

      // 添加legend选择变化事件处理
      chartInstance.current.on('legendselectchanged', (params: { selected: Record<string, boolean> }) => {
        const { selected } = params;
        // 使用setTimeout延迟setOption调用
        setTimeout(() => {
          chartInstance.current?.setOption({
            legend: { selected }
          });
        }, 0);
      });

      console.log('Setting chart option:', option);
      chartInstance.current.setOption(option, true);
    } catch (error) {
      console.error('Failed to update chart:', error);
    }
  }, [data]); // 只在data变化时更新

  return (
    <div>
      <div ref={chartRef} style={{ width: '100%', height: '800px' }} />
      {data && data.length > 0 && (
        <div style={{ marginTop: '20px', padding: '16px', background: '#f5f5f5', borderRadius: '4px' }}>
          <div style={{ marginBottom: '12px' }}>
            <strong>分析结果：</strong>
          </div>
          {data.map((item) => (
            <div key={item.name} style={{ marginBottom: '8px' }}>
              <div><strong>{item.name}：</strong></div>
              <div>真峰值电平: {item.dynamics.true_peak_level.toFixed(1)}dB</div>
              <div>峰值因数: {item.dynamics.crest_factor.toFixed(1)}dB</div>
              <div>
                总体动态范围: Fast {item.dynamics.overall_dynamics.fast.range.toFixed(1)}dB / 
                Slow {item.dynamics.overall_dynamics.slow.range.toFixed(1)}dB
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DynamicsChart; 