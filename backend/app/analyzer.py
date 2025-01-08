import librosa
import numpy as np
from typing import Dict, Any
import tempfile
import os

def analyze_dynamics(y: np.ndarray, sr: int, n_fft: int, hop_length: int) -> Dict[str, Any]:
    """
    分析音频的动态范围
    
    Args:
        y: 音频数据
        sr: 采样率
        n_fft: FFT窗口大小
        hop_length: 步长
        
    Returns:
        动态范围分析结果
    """
    # 计算短时傅里叶变换
    D = librosa.stft(y, n_fft=n_fft, hop_length=hop_length)
    S = np.abs(D) ** 2
    
    # 计算每个时间点的RMS能量
    rms = librosa.feature.rms(S=S)[0]
    
    # 将能量转换为dB
    rms_db = 20 * np.log10(np.maximum(rms, 1e-10))
    
    # 计算动态范围统计
    percentiles = np.percentile(rms_db, [10, 25, 50, 75, 90])
    dynamic_range = percentiles[4] - percentiles[0]  # 90th - 10th percentile
    
    # 分频段计算动态范围
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    freq_bands = [
        (20, 100),     # 超低频
        (100, 500),    # 低频
        (500, 2000),   # 中频
        (2000, 8000),  # 高频
        (8000, 20000)  # 超高频
    ]
    
    band_dynamics = []
    for low, high in freq_bands:
        # 获取频段对应的频率bin索引
        band_mask = (freqs >= low) & (freqs < high)
        if np.any(band_mask):
            # 计算该频段的能量
            band_energy = np.sum(S[band_mask], axis=0)
            band_db = 10 * np.log10(np.maximum(band_energy, 1e-10))
            band_range = np.percentile(band_db, 90) - np.percentile(band_db, 10)
            band_dynamics.append({
                "band": f"{low}-{high}Hz",
                "dynamic_range": float(band_range),
                "percentiles": {
                    "10": float(np.percentile(band_db, 10)),
                    "50": float(np.percentile(band_db, 50)),
                    "90": float(np.percentile(band_db, 90))
                }
            })
    
    # 计算短时动态范围
    frame_duration = 0.1  # 100ms
    frame_length = int(sr * frame_duration)
    n_frames = len(y) // frame_length
    
    short_term_dynamics = []
    for i in range(n_frames):
        frame = y[i * frame_length:(i + 1) * frame_length]
        frame_rms = np.sqrt(np.mean(frame ** 2))
        frame_db = 20 * np.log10(np.maximum(frame_rms, 1e-10))
        short_term_dynamics.append(float(frame_db))
    
    return {
        "overall_dynamics": {
            "range": float(dynamic_range),
            "percentiles": {
                "10": float(percentiles[0]),
                "25": float(percentiles[1]),
                "50": float(percentiles[2]),
                "75": float(percentiles[3]),
                "90": float(percentiles[4])
            }
        },
        "band_dynamics": band_dynamics,
        "short_term_dynamics": {
            "frame_duration_ms": 100,
            "values": short_term_dynamics
        }
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
            
            # 设置STFT参数
            n_fft = 2048  # FFT窗口大小
            hop_length = n_fft // 4  # 步长
            
            # 计算RMS能量
            rms = librosa.feature.rms(y=y, frame_length=n_fft, hop_length=hop_length)[0]
            
            # 设置能量门限值（可以根据需要调整）
            threshold_db = -40
            threshold_linear = 10 ** (threshold_db / 20)
            
            # 找出高于门限值的帧
            active_frames = rms > threshold_linear
            
            if not np.any(active_frames):
                raise Exception("未检测到有效音频信号")
            
            # 计算频谱图
            D = librosa.stft(y, n_fft=n_fft, hop_length=hop_length)
            S = np.abs(D) ** 2
            
            # 只分析有效帧
            S_active = S[:, active_frames]
            
            if S_active.size == 0:
                raise Exception("未检测到有效音频信号")
            
            # 使用90th百分位数而不是平均值
            S_percentile = np.percentile(S_active, 90, axis=1)
            
            # 转换为分贝值
            ref_value = np.max(S_percentile) * 1e-6
            S_db = 10.0 * np.log10(np.maximum(S_percentile, 1e-10) / ref_value)
            
            # 计算频率数组
            freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
            
            # 确保频率数组和幅度数组长度匹配
            assert len(freqs) == len(S_db), f"频率数组长度 ({len(freqs)}) 与幅度数组长度 ({len(S_db)}) 不匹配"
            
            # 只保留20Hz-20kHz范围内的数据
            mask = (freqs >= 20) & (freqs <= 20000)
            freqs = freqs[mask]
            S_db = S_db[mask]
            
            # 平滑处理
            window_size = 5
            smoothed_magnitudes = np.convolve(S_db, np.ones(window_size)/window_size, mode='same')
            
            # 对数据进行降采样（如果数据点太多）
            if len(freqs) > 1000:
                # 使用对数间隔的采样点
                log_freqs = np.logspace(np.log10(20), np.log10(20000), 1000)
                # 使用插值获取新的幅度值
                smoothed_magnitudes = np.interp(
                    log_freqs,
                    freqs,
                    smoothed_magnitudes
                )
                freqs = log_freqs
            
            # 归一化处理
            max_magnitude = np.max(smoothed_magnitudes)
            min_magnitude = np.min(smoothed_magnitudes)
            magnitude_range = max_magnitude - min_magnitude
            
            # 将幅度值映射到-40dB到0dB范围
            normalized_magnitudes = -40 + (smoothed_magnitudes - min_magnitude) / magnitude_range * 40
            
            # 分析动态范围
            dynamics_data = analyze_dynamics(y, sr, n_fft, hop_length)
            
            # 打印调试信息
            print(f"Analysis info: sr={sr}, n_fft={n_fft}, freqs_shape={freqs.shape}, mags_shape={normalized_magnitudes.shape}")
            print(f"Active frames: {np.sum(active_frames)} / {len(active_frames)} ({np.mean(active_frames)*100:.1f}%)")
            print(f"Magnitude range: {min_magnitude:.2f}dB to {max_magnitude:.2f}dB")
            print(f"Normalized range: {np.min(normalized_magnitudes):.2f}dB to {np.max(normalized_magnitudes):.2f}dB")
            print(f"Overall dynamic range: {dynamics_data['overall_dynamics']['range']:.2f}dB")
            
            return {
                "frequencies": freqs.tolist(),
                "magnitudes": normalized_magnitudes.tolist(),
                "sample_rate": sr,
                "analysis_points": len(freqs),
                "active_frames_ratio": float(np.mean(active_frames)),
                "original_range": {
                    "min": float(min_magnitude),
                    "max": float(max_magnitude)
                },
                "dynamics": dynamics_data
            }
            
        finally:
            # 清理临时文件
            os.unlink(temp_file_path)
            
    except Exception as e:
        print(f"Analysis error details: {str(e)}")
        raise Exception(f"音频分析失败: {str(e)}") 