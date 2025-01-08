# 音频频响曲线分析工具

这是一个基于Web的音频频响曲线分析工具，可以分析音频文件的频率响应特性和动态范围，支持多个音频文件的对比分析。

## 主要特性

- 支持多种音频格式（WAV、MP3、OGG、FLAC等）
- 生成频响曲线和动态范围分析
- 支持多个音频文件的对比分析
- 可导出分析数据为JSON格式
- 美观的图表展示界面

## 技术栈

- 前端：React + TypeScript + Ant Design + ECharts
- 后端：Python + FastAPI
- 音频分析：librosa

## 安装和运行

### 环境要求

- Node.js >= 16.x
- Python >= 3.8
- npm 或 yarn

### 安装步骤

1. 克隆项目并安装前端依赖：
```bash
git clone [项目地址]
cd [项目目录]
npm install
```

2. 安装后端依赖：
```bash
cd backend
pip install -r requirements.txt
```

### 启动项目

1. 启动后端服务：
```bash
cd backend
uvicorn app.main:app --reload
```

2. 启动前端开发服务器：
```bash
npm run dev
```

## 使用说明

### 音频文件上传

1. 打开浏览器访问 http://localhost:5173
2. 点击上传区域或将音频文件拖拽到上传区域
3. 等待文件分析完成
4. 查看生成的频响曲线和动态范围分析图表

### 多文件对比

1. 继续上传其他音频文件
2. 新上传的文件会自动添加到图表中进行对比
3. 使用图例可以切换显示/隐藏不同文件的数据

### 数据导出

1. 完成分析后，点击"导出数据"按钮
2. 数据将以JSON格式保存到本地

## 图表解读

### 频响曲线图表

- X轴：频率（Hz），使用对数刻度
- Y轴：幅度（dB）
- 曲线含义：表示音频在不同频率下的响应强度
- 对比要点：
  - 曲线平坦度：越平坦说明频率响应越均衡
  - 频率覆盖范围：通常关注20Hz-20kHz范围
  - 峰谷变化：反映音频的频率特征

### 动态范围分析图表

#### 频段动态范围分析（上图）

- 柱状图：显示不同频段的动态范围大小
- 误差线：显示10%、50%、90%百分位数据
- 频段划分：
  - 20-100Hz：超低频
  - 100-500Hz：低频
  - 500-2000Hz：中频
  - 2000-8000Hz：高频
  - 8000-20000Hz：超高频
- 解读方式：
  - 柱高表示动态范围大小
  - 误差线表示音量分布范围
  - 不同频段的对比反映音频特性

#### 短时动态范围（下图）

- X轴：时间（秒）
- Y轴：幅度（dB）
- 曲线含义：表示音频随时间变化的动态范围
- 解读方式：
  - 曲线波动反映音量变化
  - 波峰表示响度最大值
  - 波谷表示响度最小值

## 注意事项

### 支持的音频格式

- WAV
- MP3
- OGG
- FLAC
- AAC
- M4A

### 使用限制

- 单个文件大小限制：100MB
- 支持同时对比多个音频文件
- 建议使用现代浏览器（Chrome、Firefox、Safari等）

### 使用提示

1. 上传音频文件前请确保文件格式正确
2. 分析过程中可以随时取消
3. 图表支持缩放和保存为图片
4. 可以通过图例控制显示的数据
5. 导出的JSON数据可用于后续分析

## 常见问题

Q: 为什么某些音频文件无法分析？  
A: 请确保文件格式正确，且文件未损坏。某些特殊编码的音频可能不被支持。

Q: 如何正确解读频响曲线？  
A: 频响曲线反映了音频在不同频率下的响应特性。平坦的曲线通常表示更好的频率平衡性。

Q: 动态范围数据有什么用？  
A: 动态范围数据可以帮助评估音频的音量变化范围，对于音频制作和音质评估很有帮助。