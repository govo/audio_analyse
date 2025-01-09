from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.analyzer import analyze_audio
import yaml
from pathlib import Path
import tempfile
import librosa
import os

app = FastAPI(title="音频频响分析服务")

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中应该设置具体的域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 支持的音频格式
SUPPORTED_EXTENSIONS = {'.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac'}

# 读取配置文件
config_path = Path(__file__).parent.parent / "config.yaml"
with open(config_path, "r", encoding="utf-8") as f:
    config = yaml.safe_load(f)

# 获取配置值
MAX_AUDIO_DURATION = config["audio"]["max_duration"]
MAX_FILES = config["audio"]["max_files"]

@app.get("/config")
async def get_config():
    """获取应用配置"""
    return {
        "status": "success",
        "data": {
            "audio": {
                "max_duration": MAX_AUDIO_DURATION,
                "max_files": MAX_FILES
            }
        }
    }

@app.get("/")
async def read_root():
    return {"message": "音频频响分析服务已启动"}

@app.post("/analyze")
async def analyze_audio_file(file: UploadFile = File(...)):
    try:
        # 检查文件扩展名
        file_ext = file.filename.lower().split('.')[-1]
        if f'.{file_ext}' not in SUPPORTED_EXTENSIONS:
            return {
                "status": "error",
                "message": f"不支持的文件格式。支持的格式：{', '.join(SUPPORTED_EXTENSIONS)}"
            }
        
        # 读取文件内容
        content = await file.read()
        
        # 创建临时文件来检查音频长度
        with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{file_ext}') as temp_file:
            temp_file.write(content)
            temp_file_path = temp_file.name

        try:
            # 使用librosa读取音频文件
            y, sr = librosa.load(temp_file_path, sr=None)
            duration = librosa.get_duration(y=y, sr=sr)
            
            # 检查音频长度
            if duration > MAX_AUDIO_DURATION:
                return {
                    "status": "error",
                    "message": f"音频长度超过限制。最大允许长度：{MAX_AUDIO_DURATION}秒"
                }
            
            # 分析音频
            result = analyze_audio(content)
            
            return {
                "status": "success",
                "filename": file.filename,
                "data": result
            }
            
        finally:
            # 清理临时文件
            os.unlink(temp_file_path)
            
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

@app.post("/upload")
async def upload_files(files: list[UploadFile]):
    try:
        # 检查文件数量
        if len(files) > MAX_FILES:
            return {
                "status": "error",
                "message": f"一次最多只能上传{MAX_FILES}个文件"
            }
        
        results = []
        errors = []
        
        for file in files:
            # 检查文件扩展名
            file_ext = file.filename.lower().split('.')[-1]
            if f'.{file_ext}' not in SUPPORTED_EXTENSIONS:
                errors.append({
                    "filename": file.filename,
                    "message": f"不支持的文件格式。支持的格式：{', '.join(SUPPORTED_EXTENSIONS)}"
                })
                continue
            
            # 读取文件内容
            content = await file.read()
            
            # 创建临时文件来检查音频长度
            with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{file_ext}') as temp_file:
                temp_file.write(content)
                temp_file_path = temp_file.name

            try:
                # 使用librosa读取音频文件
                y, sr = librosa.load(temp_file_path, sr=None)
                duration = librosa.get_duration(y=y, sr=sr)
                
                # 检查音频长度
                if duration > MAX_AUDIO_DURATION:
                    errors.append({
                        "filename": file.filename,
                        "message": f"音频长度超过限制。最大允许长度：{MAX_AUDIO_DURATION}秒"
                    })
                    continue
                
                # 分析音频
                result = analyze_audio(content)
                results.append({
                    "filename": file.filename,
                    "data": result
                })
                
            finally:
                # 清理临时文件
                os.unlink(temp_file_path)
        
        return {
            "status": "success" if not errors else "partial",
            "results": results,
            "errors": errors
        }
            
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        } 