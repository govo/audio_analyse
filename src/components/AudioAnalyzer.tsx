import { useState, useRef } from 'react';
import { Upload, Button, Card, message, Tooltip } from 'antd';
import { InboxOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd/es/upload/interface';
import FrequencyChart from './FrequencyChart';
import DynamicsChart from './DynamicsChart';

interface FrequencyData {
  frequencies: number[];
  magnitudes: number[];
  name: string;
  dynamics?: {
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
  };
}

const { Dragger } = Upload;

// API 配置
const API_BASE_URL = 'http://localhost:8000';

// 支持的音频格式
const SUPPORTED_AUDIO_TYPES = [
  'audio/wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/ogg',
  'audio/flac',
  'audio/aac',
  'audio/m4a',
];

const AudioAnalyzer = () => {
  const [frequencyData, setFrequencyData] = useState<FrequencyData[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 比较两个数据是否相同
  const isDataEqual = (data1: FrequencyData, data2: FrequencyData): boolean => {
    return JSON.stringify({
      frequencies: data1.frequencies,
      magnitudes: data1.magnitudes,
      dynamics: data1.dynamics
    }) === JSON.stringify({
      frequencies: data2.frequencies,
      magnitudes: data2.magnitudes,
      dynamics: data2.dynamics
    });
  };

  // 生成带序号的文件名
  const generateFileName = (baseName: string, existingNames: string[]): string => {
    let counter = 1;
    let newName = baseName;
    
    while (existingNames.includes(newName)) {
      const nameWithoutNumber = baseName.replace(/【\d+】$/, '');
      newName = `${nameWithoutNumber}【${counter}】`;
      counter++;
    }
    
    return newName;
  };

  // 处理文件上传
  const handleUpload: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess, onError } = options;
    
    try {
      setAnalyzing(true);
      setProgress(0);
      
      // 创建 AbortController
      abortControllerRef.current = new AbortController();
      const { signal } = abortControllerRef.current;
      
      // 创建 FormData
      const formData = new FormData();
      formData.append('file', file as File);
      
      // 发送请求到后端
      const response = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        body: formData,
        signal
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.detail || '分析失败';
        } catch {
          errorMessage = errorText || '分析失败';
        }
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      console.log('Analysis result:', result);
      
      if (result.status !== 'success' || !result.data) {
        throw new Error('分析结果格式错误');
      }

      // 处理新数据
      setFrequencyData(prev => {
        const fileName = (file as File).name;
        const newData: FrequencyData = {
          frequencies: result.data.frequencies,
          magnitudes: result.data.magnitudes,
          name: fileName,
          dynamics: result.data.dynamics
        };

        // 查找是否存在相同文件名的数据
        const existingIndex = prev.findIndex(item => item.name.replace(/【\d+】$/, '') === fileName);
        
        if (existingIndex === -1) {
          // 没有相同文件名的数据，直接添加
          return [...prev, newData];
        }

        // 有相同文件名的数据，检查数据是否相同
        if (isDataEqual(prev[existingIndex], newData)) {
          // 数据相同，替换旧数据
          const newArray = [...prev];
          newArray[existingIndex] = newData;
          return newArray;
        } else {
          // 数据不同，添加带序号的新数据
          const existingNames = prev.map(item => item.name);
          newData.name = generateFileName(fileName, existingNames);
          return [...prev, newData];
        }
      });
      
      onSuccess?.(result);
      message.success(`${file.name} 分析完成`);
      
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        message.info('已取消分析');
        return;
      }
      console.error('Analysis error:', error);
      onError?.(error as Error);
      message.error(`${file.name} 分析失败: ${(error as Error).message}`);
    } finally {
      setAnalyzing(false);
      setProgress(0);
      abortControllerRef.current = null;
    }
  };

  // 处理取消分析
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  // 处理数据导出
  const handleExport = () => {
    const dataStr = JSON.stringify(frequencyData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'frequency_response_data.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 频响曲线解读说明
  const frequencyChartHelp = (
    <div>
      <p><strong>频响曲线图表解读：</strong></p>
      <ul>
        <li>X轴：频率（Hz），使用对数刻度</li>
        <li>Y轴：幅度（dB）</li>
        <li>曲线含义：表示音频在不同频率下的响应强度</li>
        <li>对比要点：
          <ul>
            <li>曲线平坦度：越平坦说明频率响应越均衡</li>
            <li>频率覆盖范围：通常关注20Hz-20kHz范围</li>
            <li>峰谷变化：反映音频的频率特征</li>
          </ul>
        </li>
      </ul>
    </div>
  );

  // 动态范围解读说明
  const dynamicsChartHelp = (
    <div>
      <p><strong>动态范围分析图表解读：</strong></p>
      <p>频段动态范围分析（上图）：</p>
      <ul>
        <li>柱状图：显示不同频段的动态范围大小</li>
        <li>误差线：显示10%、50%、90%百分位数据</li>
        <li>频段划分：
          <ul>
            <li>20-100Hz：超低频</li>
            <li>100-500Hz：低频</li>
            <li>500-2000Hz：中频</li>
            <li>2000-8000Hz：高频</li>
            <li>8000-20000Hz：超高频</li>
          </ul>
        </li>
        <li>解读方式：
          <ul>
            <li>柱高表示动态范围大小</li>
            <li>误差线表示音量分布范围</li>
            <li>不同频段的对比反映音频特性</li>
          </ul>
        </li>
      </ul>
      <p>短时动态范围（下图）：</p>
      <ul>
        <li>X轴：时间（秒）</li>
        <li>Y轴：幅度（dB）</li>
        <li>曲线含义：表示音频随时间变化的动态范围</li>
        <li>解读方式：
          <ul>
            <li>曲线波动反映音量变化</li>
            <li>波峰表示响度最大值</li>
            <li>波谷表示响度最小值</li>
          </ul>
        </li>
      </ul>
    </div>
  );

  return (
    <div style={{ width: '100%', maxWidth: '100%' }}>
      <Card title="音频文件上传" style={{ marginBottom: 20, textAlign: 'left' }}>
        <Dragger
          accept={SUPPORTED_AUDIO_TYPES.join(',')}
          customRequest={handleUpload}
          showUploadList={false}
          disabled={analyzing}
          style={{ padding: '20px 0' }}
          beforeUpload={(file) => {
            if (!SUPPORTED_AUDIO_TYPES.includes(file.type)) {
              message.error('请上传支持的音频文件格式');
              return false;
            }
            const maxSize = 100 * 1024 * 1024; // 100MB
            if (file.size > maxSize) {
              message.error('文件大小不能超过100MB');
              return false;
            }
            return true;
          }}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            点击或拖拽音频文件到此区域
          </p>
          <p className="ant-upload-hint">
            支持WAV、MP3、OGG、FLAC等音频格式，文件大小不超过100MB
          </p>
        </Dragger>

        {analyzing && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>正在分析音频...</span>
              <Button size="small" onClick={handleCancel}>取消</Button>
            </div>
            <div className="ant-progress">
              <div 
                className="ant-progress-bg" 
                style={{ 
                  width: `${progress}%`,
                  height: '8px',
                  background: '#1890ff',
                  borderRadius: '4px',
                  transition: 'all 0.3s'
                }}
              />
            </div>
          </div>
        )}

        {frequencyData.length > 0 && !analyzing && (
          <Button 
            type="primary" 
            onClick={handleExport}
            style={{ marginTop: 16 }}
          >
            导出数据
          </Button>
        )}
      </Card>
      
      <Card 
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            频响曲线
            <Tooltip 
              title={frequencyChartHelp} 
              overlayStyle={{ maxWidth: '500px' }}
              placement="right"
            >
              <Button 
                type="text" 
                icon={<QuestionCircleOutlined />}
                style={{ color: '#1890ff' }}
              >
                查看解读说明
              </Button>
            </Tooltip>
          </div>
        } 
        bodyStyle={{ padding: '12px' }}
      >
        <FrequencyChart data={frequencyData} />
        <div style={{ 
          marginTop: '12px', 
          padding: '12px', 
          background: '#f5f5f5', 
          borderRadius: '4px',
          fontSize: '14px',
          color: '#666'
        }}>
          <div>提示：将鼠标悬停在图表上可以查看详细数据，点击图例可以切换显示不同的音频文件。</div>
          <div style={{ marginTop: '8px' }}>
            点击上方的"查看解读说明"按钮，了解如何解读频响曲线图表。
          </div>
        </div>
      </Card>
      
      <Card 
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            动态范围分析
            <Tooltip 
              title={dynamicsChartHelp} 
              overlayStyle={{ maxWidth: '500px' }}
              placement="right"
            >
              <Button 
                type="text" 
                icon={<QuestionCircleOutlined />}
                style={{ color: '#1890ff' }}
              >
                查看解读说明
              </Button>
            </Tooltip>
          </div>
        }
        style={{ marginTop: 20 }}
        bodyStyle={{ padding: '12px' }}
        extra={
          frequencyData.length > 0 && (
            <span>
              总体动态范围: {
                frequencyData
                  .map(item => item.dynamics?.overall_dynamics.range.toFixed(1))
                  .join(', ')
              }dB
            </span>
          )
        }
      >
        <DynamicsChart 
          data={frequencyData
            .filter(item => item.dynamics)
            .map(item => ({
              name: item.name,
              dynamics: item.dynamics!
            }))} 
        />
        <div style={{ 
          marginTop: '12px', 
          padding: '12px', 
          background: '#f5f5f5', 
          borderRadius: '4px',
          fontSize: '14px',
          color: '#666'
        }}>
          <div>提示：图表分为上下两部分，上部显示频段动态范围，下部显示短时动态范围。</div>
          <div style={{ marginTop: '8px' }}>
            点击上方的"查看解读说明"按钮，了解如何解读动态范围分析图表。
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AudioAnalyzer; 