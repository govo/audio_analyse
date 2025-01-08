import { useState, useRef } from 'react';
import { Upload, Button, Card, message } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
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
      
      // 更新频响数据
      setFrequencyData(prev => [...prev, {
        frequencies: result.data.frequencies,
        magnitudes: result.data.magnitudes,
        name: (file as File).name,
        dynamics: result.data.dynamics
      }]);
      
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
      
      <Card title="频响曲线" bodyStyle={{ padding: '12px' }}>
        <FrequencyChart data={frequencyData} />
      </Card>
      
      <Card 
        title="动态范围分析" 
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
      </Card>
    </div>
  );
};

export default AudioAnalyzer; 