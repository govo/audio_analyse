import { useState, useRef, useEffect } from 'react';
import { Upload, Button, Card, message, Tooltip, Modal } from 'antd';
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
  const [config, setConfig] = useState<{ audio: { max_files: number; max_duration: number } }>();
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isHelpModalVisible, setIsHelpModalVisible] = useState(false);
  const [helpModalTitle, setHelpModalTitle] = useState('');
  const [helpModalContent, setHelpModalContent] = useState<React.ReactNode>(null);

  // 获取配置
  useEffect(() => {
    fetch(`${API_BASE_URL}/config`)
      .then(response => response.json())
      .then(result => {
        if (result.status === 'success') {
          setConfig(result.data);
        }
      })
      .catch(error => {
        console.error('Failed to load config:', error);
        message.error('加载配置失败');
      });
  }, []);

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
      
      if (result.status === 'error') {
        message.error(result.message);
        onError?.(new Error(result.message));
        return;
      }

      if (result.status === 'partial') {
        // 显示部分成功的信息
        result.errors?.forEach((error: { filename: string; message: string }) => {
          message.error(`${error.filename}: ${error.message}`);
        });
        
        // 处理成功的结果
        result.results?.forEach((item: { 
          filename: string; 
          data: { 
            frequencies: number[]; 
            magnitudes: number[]; 
            dynamics?: FrequencyData['dynamics'] 
          } 
        }) => {
          setFrequencyData(prev => {
            const newData: FrequencyData = {
              frequencies: item.data.frequencies,
              magnitudes: item.data.magnitudes,
              name: item.filename,
              dynamics: item.data.dynamics
            };
            return [...prev, newData];
          });
          message.success(`${item.filename} 分析完成`);
        });
        
        return;
      }

      if (!result.data) {
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

  // 处理数据清除
  const handleClear = () => {
    setFrequencyData([]);
    setProgress(0);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    message.success('数据已清除');
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
        <li>分析方法：
          <ul>
            <li>使用1/3倍频程分析（ISO标准频段）</li>
            <li>应用A加权滤波，符合人耳感知特性</li>
            <li>Fast响应：125ms时间常数，适合瞬态分析</li>
            <li>Slow响应：1000ms时间常数，适合稳态分析</li>
          </ul>
        </li>
        <li>图表元素：
          <ul>
            <li>柱状图：显示Fast和Slow响应的动态范围</li>
            <li>误差线：显示10%到90%百分位声压级范围</li>
            <li>频段：从20Hz到20kHz的31个ISO标准频段</li>
          </ul>
        </li>
        <li>专业指标：
          <ul>
            <li>真峰值电平（True Peak Level）：反映信号的绝对峰值，用于评估设备的过载余量</li>
            <li>峰值因数（Crest Factor）：峰值与RMS的比值，反映设备处理瞬态信号的能力</li>
            <li>总体动态范围：Fast和Slow响应的90%-10%百分位差值，表示设备的信噪比性能</li>
          </ul>
        </li>
        <li>设备性能评估：
          <ul>
            <li>动态范围大小：较大的动态范围（{'>'}90dB）表示设备具有优秀的信噪比</li>
            <li>频段均衡性：各频段动态范围均衡表示设备在全频段都有良好表现</li>
            <li>Fast/Slow对比：Fast响应接近Slow响应表示设备的瞬态响应性能好</li>
            <li>峰值处理：较高的峰值因数（{'>'}15dB）表示设备有充足的动态余量</li>
          </ul>
        </li>
      </ul>
      <p>短时动态范围（下图）：</p>
      <ul>
        <li>分析参数：
          <ul>
            <li>时间窗口：100ms（符合EBU R128标准）</li>
            <li>采用A加权和RMS计算</li>
          </ul>
        </li>
        <li>图表说明：
          <ul>
            <li>X轴：时间（秒）</li>
            <li>Y轴：A加权声压级（dB）</li>
            <li>曲线：反映音频响度的时间变化特性</li>
          </ul>
        </li>
        <li>设备性能指标：
          <ul>
            <li>响应速度：曲线的上升/下降速度反映设备的瞬态响应性能</li>
            <li>过冲控制：峰值过冲的大小反映设备的限幅性能</li>
            <li>底噪控制：最低电平的稳定性反映设备的噪声控制能力</li>
            <li>动态精度：曲线的平滑度反映设备的动态处理精度</li>
          </ul>
        </li>
        <li>应用场景：
          <ul>
            <li>评估音频设备的动态性能</li>
            <li>分析音频信号的响度一致性</li>
            <li>识别设备的压缩和限幅特征</li>
            <li>评估设备的噪声控制能力</li>
          </ul>
        </li>
      </ul>
    </div>
  );

  // 显示帮助弹层
  const showHelpModal = (title: string, content: React.ReactNode) => {
    setHelpModalTitle(title);
    setHelpModalContent(content);
    setIsHelpModalVisible(true);
  };

  // 处理文件上传前的验证
  const beforeUpload = (file: File, fileList: File[]) => {
    // 检查文件数量
    if (config && fileList.length > config.audio.max_files) {
      message.error(`一次最多只能上传${config.audio.max_files}个文件`);
      return false;
    }

    // 检查文件类型
    const isAudioFile = SUPPORTED_AUDIO_TYPES.includes(file.type);
    if (!isAudioFile) {
      message.error('只支持上传音频文件！');
      return false;
    }

    return true;
  };

  return (
    <div style={{ width: '100%', maxWidth: '100%' }}>
      <Card title="音频文件上传" style={{ marginBottom: 20, textAlign: 'left' }}>
        <Dragger
          customRequest={handleUpload}
          beforeUpload={beforeUpload}
          multiple={true}
          maxCount={config?.audio.max_files}
          showUploadList={false}
          accept={SUPPORTED_AUDIO_TYPES.join(',')}
          disabled={analyzing || !config}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">
            点击或拖拽音频文件到此区域
          </p>
          <p className="ant-upload-hint">
            支持WAV、MP3、OGG、FLAC等音频格式
            {config && (
              <>
                <br />
                最长时间：{config.audio.max_duration}秒，
                最多{config.audio.max_files}个文件
              </>
            )}
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
          <div style={{ marginTop: 16, display: 'flex', gap: '8px' }}>
            <Button 
              type="primary" 
              onClick={handleExport}
            >
              导出数据
            </Button>
            <Button 
              onClick={handleClear}
              danger
            >
              清除数据
            </Button>
          </div>
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
            <Button 
              type="text" 
              icon={<QuestionCircleOutlined />}
              style={{ color: '#1890ff' }}
              onClick={() => showHelpModal('动态范围分析说明', dynamicsChartHelp)}
            >
              查看解读说明
            </Button>
          </div>
        }
        style={{ marginTop: 20 }}
        bodyStyle={{ padding: '12px' }}
        extra={
          frequencyData.length > 0 && (
            <span>
              总体动态范围: {
                frequencyData
                  .filter(item => item.dynamics?.overall_dynamics?.fast?.range)
                  .map(item => item.dynamics.overall_dynamics.fast.range.toFixed(1))
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
              dynamics: item.dynamics
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
          <div>提示：图表上方显示各频段的动态范围，下方显示短时动态范围变化。</div>
          <div style={{ marginTop: '8px' }}>
            点击上方的"查看解读说明"按钮，了解如何解读动态范围分析图表。
          </div>
        </div>
      </Card>

      <Modal
        title={helpModalTitle}
        open={isHelpModalVisible}
        onCancel={() => setIsHelpModalVisible(false)}
        footer={null}
        width={800}
        style={{ top: 20 }}
      >
        {helpModalContent}
      </Modal>
    </div>
  );
};

export default AudioAnalyzer; 