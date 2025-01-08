import librosa
import numpy as np
from typing import Dict, Any
import tempfile
import os

def analyze_dynamics(y: np.ndarray, sr: int, n_fft: int, hop_length: int) -> Dict[str, Any]:
    """
    分析音频的动态范围，使用专业音响标准
    
    Args:
        y: 音频数据
        sr: 采样率
        n_fft: FFT窗口大小
        hop_length: 步长
        
    Returns:
        动态范围分析结果
    """
    # 应用A加权滤波
    frequencies = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    a_weighting = librosa.A_weighting(frequencies)
    
    # 计算短时傅里叶变换（使用汉宁窗）
    D = librosa.stft(y, n_fft=n_fft, hop_length=hop_length, window='hann')
    # 应用A加权到频谱上
    D_weighted = D * np.exp(a_weighting[:, np.newaxis] / 20.0)
    S = np.abs(D_weighted) ** 2
    
    # 定义时间加权参数（Fast: 125ms, Slow: 1000ms）
    fast_time = 0.125  # 秒
    slow_time = 1.0    # 秒
    
    # 计算时间加权的RMS能量
    def time_weighted_rms(signal: np.ndarray, time_constant: float, sample_rate: int) -> np.ndarray:
        alpha = np.exp(-hop_length / (time_constant * sample_rate))
        weighted = np.zeros_like(signal)
        weighted[0] = signal[0]
        for i in range(1, len(signal)):
            weighted[i] = alpha * weighted[i-1] + (1 - alpha) * signal[i]
        return weighted
    
    # 计算Fast和Slow时间加权的RMS
    rms = librosa.feature.rms(S=S, frame_length=n_fft)[0]
    rms_fast = time_weighted_rms(rms, fast_time, sr)
    rms_slow = time_weighted_rms(rms, slow_time, sr)
    
    # 转换为dB，考虑数字满刻度参考电平
    ref_level = 1.0
    rms_fast_db = 20 * np.log10(np.maximum(rms_fast, 1e-10) / ref_level)
    rms_slow_db = 20 * np.log10(np.maximum(rms_slow, 1e-10) / ref_level)
    
    # 计算真峰值电平（True Peak Level）
    # 对原始信号进行A加权处理
    y_weighted = librosa.istft(D_weighted, hop_length=hop_length, window='hann')
    true_peak = librosa.feature.rms(y=librosa.resample(y_weighted, orig_sr=sr, target_sr=sr*4), 
                                  frame_length=n_fft//4)[0]
    true_peak_db = 20 * np.log10(np.maximum(np.max(true_peak), 1e-10))
    
    # 计算峰值因数（Crest Factor）
    crest_factor = true_peak_db - np.mean(rms_slow_db)
    
    # 计算动态范围统计
    def calculate_dynamics_stats(levels: np.ndarray) -> Dict[str, float]:
        percentiles = np.percentile(levels, [10, 25, 50, 75, 90])
        return {
            "range": float(percentiles[4] - percentiles[0]),  # 90th - 10th percentile
            "percentiles": {
                "10": float(percentiles[0]),
                "25": float(percentiles[1]),
                "50": float(percentiles[2]),
                "75": float(percentiles[3]),
                "90": float(percentiles[4])
            }
        }
    
    # 定义1/3倍频程中心频率（ISO标准）
    center_freqs = [
        20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500,
        630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000,
        10000, 12500, 16000, 20000
    ]
    
    # 计算频段动态范围
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    band_dynamics = []
    
    for center_freq in center_freqs:
        # 计算1/3倍频程带宽
        freq_min = center_freq / 2 ** (1/6)
        freq_max = center_freq * 2 ** (1/6)
        
        # 获取频段对应的频率bin索引
        band_mask = (freqs >= freq_min) & (freqs < freq_max)
        if np.any(band_mask):
            # 计算该频段的能量
            band_energy = np.sum(S[band_mask], axis=0)
            band_db = 10 * np.log10(np.maximum(band_energy, 1e-10))
            
            # 应用时间加权
            band_db_fast = time_weighted_rms(band_db, fast_time, sr)
            band_db_slow = time_weighted_rms(band_db, slow_time, sr)
            
            # 计算该频段的动态范围统计
            band_stats_fast = calculate_dynamics_stats(band_db_fast)
            band_stats_slow = calculate_dynamics_stats(band_db_slow)
            
            band_dynamics.append({
                "band": f"{center_freq}Hz",
                "dynamic_range": {
                    "fast": band_stats_fast["range"],
                    "slow": band_stats_slow["range"]
                },
                "percentiles": {
                    "fast": band_stats_fast["percentiles"],
                    "slow": band_stats_slow["percentiles"]
                }
            })
    
    # 计算短时动态范围（使用100ms窗口，符合EBU R128）
    frame_duration = 0.1  # 100ms
    frame_length = int(sr * frame_duration)
    n_frames = len(y_weighted) // frame_length
    
    short_term_dynamics = []
    for i in range(n_frames):
        frame = y_weighted[i * frame_length:(i + 1) * frame_length]
        frame_rms = np.sqrt(np.mean(frame ** 2))
        frame_db = 20 * np.log10(np.maximum(frame_rms, 1e-10))
        short_term_dynamics.append(float(frame_db))
    
    return {
        "overall_dynamics": {
            "fast": calculate_dynamics_stats(rms_fast_db),
            "slow": calculate_dynamics_stats(rms_slow_db)
        },
        "true_peak_level": float(true_peak_db),
        "crest_factor": float(crest_factor),
        "band_dynamics": band_dynamics,
        "short_term_dynamics": {
            "frame_duration_ms": 100,
            "values": short_term_dynamics
        }
    }

def calculate_frequency_response(y: np.ndarray, sr: int, n_fft: int = 2048, hop_length: int = None) -> Dict[str, Any]:
    """
    计算音频的频率响应
    使用1/3倍频程分析方法
    
    Args:
        y: 音频数据
        sr: 采样率
        n_fft: FFT窗口大小
        hop_length: 步长
        
    Returns:
        频率响应数据
    """
    if hop_length is None:
        hop_length = n_fft // 4

    # 计算短时傅里叶变换
    D = librosa.stft(y, n_fft=n_fft, hop_length=hop_length, window='hann')
    
    # 计算功率谱
    S = np.abs(D) ** 2
    
    # 获取频率数组
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    
    # 定义1/3倍频程中心频率（ISO标准）
    center_freqs = [
        20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500,
        630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000,
        10000, 12500, 16000, 20000
    ]
    
    # 计算每个频带的能量
    band_energies = []
    for center_freq in center_freqs:
        # 计算频带的上下限（1/3倍频程）
        freq_min = center_freq / 2 ** (1/6)
        freq_max = center_freq * 2 ** (1/6)
        
        # 找到对应的频率bin
        mask = (freqs >= freq_min) & (freqs < freq_max)
        if np.any(mask):
            # 计算该频带的平均能量
            band_energy = np.mean(S[mask], axis=0)
            # 转换为dB，并取时间平均
            band_energy_db = 10 * np.log10(np.maximum(np.mean(band_energy), 1e-10))
            band_energies.append(band_energy_db)
        else:
            band_energies.append(float('-inf'))
    
    # 将能量值转换为相对值（归一化）
    band_energies = np.array(band_energies)
    valid_energies = band_energies[band_energies > float('-inf')]
    if len(valid_energies) > 0:
        # 使用1kHz频率作为参考点（通常的标准做法）
        ref_idx = center_freqs.index(1000)
        ref_energy = band_energies[ref_idx]
        relative_response = band_energies - ref_energy
        
        # 限制范围在-40dB到+20dB之间（专业音响常用范围）
        relative_response = np.clip(relative_response, -40, 20)
    else:
        relative_response = np.zeros_like(band_energies)
    
    # 计算频响曲线的统计特性
    valid_mask = band_energies > float('-inf')
    response_stats = {
        "mean": float(np.mean(relative_response[valid_mask])),
        "std": float(np.std(relative_response[valid_mask])),
        "flatness": float(np.max(relative_response[valid_mask]) - np.min(relative_response[valid_mask])),
        "reference_level": float(ref_energy)
    }
    
    return {
        "frequencies": center_freqs,
        "magnitudes": relative_response.tolist(),
        "stats": response_stats
    }

def analyze_audio(file_content: bytes) -> Dict[str, Any]:
    """
    分析音频文件并返回频响数据
    
    Args:
        file_content: 音频文件的二进制内容
        
    Returns:
        包含频率和幅度数据的字典
    """
    try:
        # 创建临时文件
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
            temp_file.write(file_content)
            temp_file_path = temp_file.name

        try:
            # 加载音频文件
            y, sr = librosa.load(temp_file_path, sr=None)
            
            # 设置分析参数
            n_fft = 8192  # 更大的FFT窗口以获得更好的频率分辨率
            hop_length = n_fft // 4
            
            # 计算RMS能量
            rms = librosa.feature.rms(y=y, frame_length=n_fft, hop_length=hop_length)[0]
            
            # 设置能量门限值
            threshold_db = -60  # 更低的门限值以捕获更多细节
            threshold_linear = 10 ** (threshold_db / 20)
            
            # 找出高于门限值的帧
            active_frames = rms > threshold_linear
            
            if not np.any(active_frames):
                raise Exception("未检测到有效音频信号")
            
            # 计算频响
            frequency_response = calculate_frequency_response(y, sr, n_fft, hop_length)
            
            # 计算动态范围
            dynamics_data = analyze_dynamics(y, sr, n_fft, hop_length)
            
            return {
                "frequencies": frequency_response["frequencies"],
                "magnitudes": frequency_response["magnitudes"],
                "frequency_response_stats": frequency_response["stats"],
                "sample_rate": sr,
                "analysis_points": len(frequency_response["frequencies"]),
                "active_frames_ratio": float(np.mean(active_frames)),
                "dynamics": dynamics_data
            }
            
        finally:
            # 清理临时文件
            os.unlink(temp_file_path)
            
    except Exception as e:
        print(f"Analysis error details: {str(e)}")
        raise Exception(f"音频分析失败: {str(e)}") 