from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.analyzer import analyze_audio

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

@app.get("/")
async def read_root():
    return {"message": "音频频响分析服务已启动"}

@app.post("/analyze")
async def analyze_audio_file(file: UploadFile = File(...)):
    try:
        # 检查文件扩展名
        file_ext = file.filename.lower().split('.')[-1]
        if f'.{file_ext}' not in SUPPORTED_EXTENSIONS:
            raise HTTPException(
                status_code=400, 
                detail=f"不支持的文件格式。支持的格式：{', '.join(SUPPORTED_EXTENSIONS)}"
            )
        
        # 读取文件内容
        content = await file.read()
        
        # 分析音频
        result = analyze_audio(content)
        
        return {
            "status": "success",
            "filename": file.filename,
            "data": result
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) 