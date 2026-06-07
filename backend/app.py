"""
Voice Story Agent - Backend API Server
声音克隆讲故事智能体后端服务

小程序 API 接口：
  POST /api/upload-voice   上传声音样本，返回 voiceId
  POST /api/generate-story  生成故事（文本+语音），返回 story + audioFile
  GET  /output/<filename>  获取生成的音频文件
  GET  /api/health         健康检查
"""
import os
import re
import uuid
import time
import json
import logging
import threading
from pathlib import Path
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

load_dotenv()

import dashscope
from dashscope.audio.tts_v2 import VoiceEnrollmentService, SpeechSynthesizer
from dashscope import Generation

# ─── 配置 ────────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

BASE_DIR    = Path(__file__).parent
UPLOAD_DIR  = BASE_DIR / "uploads"
OUTPUT_DIR  = BASE_DIR / "outputs"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)

ALLOWED_AUDIO = {"wav", "mp3", "m4a", "ogg", "webm", "flac", "aac", "pcm"}
MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50MB

# DashScope 配置
TARGET_MODEL = "cosyvoice-v3.5-plus"
VOICE_PREFIX = "storytime"
dashscope.api_key = os.getenv("DASHSCOPE_API_KEY", "")
dashscope.base_http_api_url = "https://dashscope.aliyuncs.com/api/v1"

app = Flask(__name__)
CORS(app, origins="*")
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE

# 内存存储
voice_registry: dict[str, str] = {}   # temp_file_path -> voice_id
task_status:  dict[str, dict] = {}   # task_id -> status


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_AUDIO


def sanitize(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_\-]", "", name)[:20]


# ─── DashScope 辅助 ───────────────────────────────────────────────────────────
def upload_to_dashscope(local_path: str) -> str:
    """
    上传文件到 DashScope，返回可访问的 URL。
    使用 DashScope Files API。
    """
    import requests
    api_key = os.getenv("DASHSCOPE_API_KEY", "")
    upload_url = "https://dashscope.aliyuncs.com/api/v1/files"

    filename = Path(local_path).name
    ext = filename.rsplit(".", 1)[-1].lower()
    mime_map = {
        "wav": "audio/wav", "mp3": "audio/mpeg",
        "m4a": "audio/mp4", "ogg": "audio/ogg",
        "flac": "audio/flac", "pcm": "audio/pcm",
    }
    mime_type = mime_map.get(ext, "audio/wav")

    with open(local_path, "rb") as f:
        resp = requests.post(
            upload_url,
            headers={"Authorization": f"Bearer {api_key}"},
            files={"file": (filename, f, mime_type)},
            data={"purpose": "voice-cloning"},
            timeout=60,
        )

    if resp.status_code != 200:
        raise RuntimeError(f"DashScope 文件上传失败 ({resp.status_code}): {resp.text[:200]}")

    data = resp.json()
    file_url = data.get("url") or data.get("data", {}).get("url")
    file_id  = data.get("id")  or data.get("data", {}).get("id")

    if file_url:
        logger.info(f"文件上传成功，URL: {file_url[:60]}...")
        return file_url
    if file_id:
        # 用 file_id 构造 URL（DashScope 支持）
        logger.info(f"文件上传成功，file_id: {file_id}")
        return f"dashscope://{file_id}"

    raise RuntimeError(f"无法获取上传文件地址: {data}")


def do_clone_voice(audio_url_or_path: str, voice_name: str) -> str:
    """
    调用 CosyVoice 声音克隆 API，返回 voice_id。
    audio_url_or_path: DashScope 文件 URL 或本地路径
    """
    import requests
    api_key = os.getenv("DASHSCOPE_API_KEY", "")

    prefix = sanitize(voice_name) or VOICE_PREFIX
    clone_url = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization"

    payload = {
        "model":    "voice-enrollment",
        "action":    "create_voice",
        "target_model": TARGET_MODEL,
        "prefix":   prefix,
        "enable_preprocess": True,
        "max_prompt_audio_length": 20.0,
    }

    # 判断是 URL 还是本地路径
    if audio_url_or_path.startswith("http"):
        payload["url"] = audio_url_or_path
    elif audio_url_or_path.startswith("dashscope://"):
        payload["file_id"] = audio_url_or_path.replace("dashscope://", "")
    else:
        # 本地路径：先上传
        audio_url_or_path = upload_to_dashscope(audio_url_or_path)
        payload["url"] = audio_url_or_path

    logger.info(f"调用声音克隆 API，prefix={prefix}")
    resp = requests.post(
        clone_url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type":  "application/json",
        },
        json=payload,
        timeout=60,
    )

    if resp.status_code != 200:
        raise RuntimeError(f"声音克隆 API 失败 ({resp.status_code}): {resp.text[:300]}")

    data = resp.json()
    voice_id = data.get("output", {}).get("voice_id")
    if not voice_id:
        raise RuntimeError(f"未返回 voice_id: {data}")
    logger.info(f"声音克隆成功，voice_id={voice_id}")
    return voice_id


def wait_voice_ok(voice_id: str, max_wait: int = 180) -> bool:
    """轮询等待音色部署完成，返回是否就绪"""
    import requests
    api_key = os.getenv("DASHSCOPE_API_KEY", "")
    query_url = "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization"

    for _ in range(max_wait // 5):
        try:
            resp = requests.post(
                query_url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type":  "application/json",
                },
                json={
                    "model": "voice-enrollment",
                    "action":   "query_voice",
                    "voice_id": voice_id,
                },
                timeout=15,
            )
            status = resp.json().get("output", {}).get("status", "")
            logger.info(f"音色状态: {status}")
            if status == "OK":
                return True
            if status == "FAILED":
                return False
        except Exception as e:
            logger.warning(f"状态查询异常: {e}")
        time.sleep(5)

    return False


def generate_story(theme: str, length_words: int = 600) -> str:
    """调用 Qwen 生成睡前故事，返回故事文本"""
    logger.info(f"生成故事: theme={theme}, length={length_words}字")
    prompt = (
        f"请创作一个以「{theme}」为主题的睡前故事。"
        f"故事长度约 {length_words} 字，语言优美舒缓，适合朗读，"
        "结尾温馨，避免使用恐怖、紧张情节。"
        "直接输出故事正文，不要标题，不要引号包裹。"
    )
    try:
        resp = Generation.call(
            model="qwen-max",
            messages=[
                {"role": "system", "content":
                    "你是一位温柔的睡前故事讲述者，创作优美舒缓的睡前故事，"
                    "帮助听众放松入睡。语言优美、节奏舒缓，充满想象力但不刺激。"},
                {"role": "user", "content": prompt},
            ],
            result_format="message",
        )
        story = resp.output.choices[0].message.content
        logger.info(f"故事生成成功，{len(story)} 字")
        return story
    except Exception as e:
        logger.error(f"故事生成失败: {e}")
        raise RuntimeError(f"故事生成失败: {e}")


def synthesize_audio(voice_id: str, text: str, output_path: str) -> None:
    """用克隆声音合成音频，保存到 output_path"""
    logger.info(f"合成音频: voice_id={voice_id}, 文本长度={len(text)}")
    try:
        synthesizer = SpeechSynthesizer(model=TARGET_MODEL, voice=voice_id)
        audio_data = synthesizer.call(text)
        with open(output_path, "wb") as f:
            f.write(audio_data)
        logger.info(f"音频合成成功: {output_path}")
    except Exception as e:
        logger.error(f"音频合成失败: {e}")
        raise RuntimeError(f"音频合成失败: {e}")


# ─── API 路由 ─────────────────────────────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def health():
    api_key = os.getenv("DASHSCOPE_API_KEY", "")
    return jsonify({
        "status":  "ok",
        "api_key": bool(api_key and api_key != "your_dashscope_api_key_here"),
        "model":   TARGET_MODEL,
    })


@app.route("/api/upload-voice", methods=["POST"])
def upload_voice():
    """
    小程序调用：上传声音样本
    返回: { success: true, voiceId: "xxx" }
    """
    if "audio" not in request.files:
        return jsonify({"success": False, "error": "请上传音频文件"}), 400

    file = request.files["audio"]
    if file.filename == "":
        return jsonify({"success": False, "error": "未选择文件"}), 400

    if not allowed_file(file.filename):
        return jsonify({
            "success": False,
            "error":   f"不支持的格式，请上传: {', '.join(sorted(ALLOWED_AUDIO))}"
        }), 400

    api_key = os.getenv("DASHSCOPE_API_KEY", "")
    if not api_key or api_key == "your_dashscope_api_key_here":
        return jsonify({"success": False, "error": "服务端未配置 API Key"}), 500

    # 保存上传文件
    ext      = file.filename.rsplit(".", 1)[-1].lower()
    file_id  = uuid.uuid4().hex[:12]
    filename = secure_filename(file.filename)
    save_path = str(UPLOAD_DIR / f"{file_id}.{ext}")
    file.save(save_path)
    logger.info(f"声音文件已保存: {save_path}")

    # 获取声音名称
    voice_name = request.form.get("filename", f"voice_{file_id}")

    try:
        # 上传到 DashScope 获取 URL
        audio_url = upload_to_dashscope(save_path)
        # 克隆声音
        voice_id = do_clone_voice(audio_url, voice_name)
        # 等待音色就绪
        ok = wait_voice_ok(voice_id)
        if not ok:
            return jsonify({"success": False, "error": "音色部署失败，请重试或更换音频"}), 500

        # 记录 voice_id
        voice_registry[file_id] = voice_id
        logger.info(f"上传+克隆完成: file_id={file_id}, voice_id={voice_id}")

        return jsonify({"success": True, "voiceId": voice_id, "fileId": file_id})

    except Exception as e:
        logger.error(f"声音上传/克隆失败: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/generate-story", methods=["POST"])
def generate_story_api():
    """
    小程序调用：生成故事 + 语音合成
    参数: { voiceId: "xxx", theme: "xxx", length: 600 }
    返回: { success: true, story: "...", audioFile: "xxx.mp3" }
    """
    body = request.get_json(force=True, silent=True) or {}
    voice_id = body.get("voiceId", "")
    theme    = body.get("theme", "")
    length   = body.get("length", 600)   # 字数

    if not voice_id:
        return jsonify({"success": False, "error": "缺少 voiceId"}), 400
    if not theme:
        return jsonify({"success": False, "error": "缺少故事主题"}), 400

    api_key = os.getenv("DASHSCOPE_API_KEY", "")
    if not api_key or api_key == "your_dashscope_api_key_here":
        return jsonify({"success": False, "error": "服务端未配置 API Key"}), 500

    try:
        # Step 1: 生成故事文本
        logger.info(f"开始生成故事: theme={theme}, length={length}")
        story_text = generate_story(theme, length)

        # Step 2: 合成音频
        out_id      = uuid.uuid4().hex[:12]
        audio_file  = f"{out_id}.mp3"
        output_path = str(OUTPUT_DIR / audio_file)
        synthesize_audio(voice_id, story_text, output_path)

        logger.info(f"故事生成完成: audio_file={audio_file}")
        return jsonify({
            "success":   True,
            "story":     story_text,
            "audioFile": audio_file,
        })

    except Exception as e:
        logger.error(f"生成故事失败: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/output/<filename>", methods=["GET"])
def get_output(filename: str):
    """提供生成的音频文件访问"""
    file_path = OUTPUT_DIR / secure_filename(filename)
    if not file_path.exists():
        return jsonify({"error": "文件不存在"}), 404
    return send_file(str(file_path), mimetype="audio/mpeg", as_attachment=False)


@app.route("/api/output/<filename>", methods=["GET"])
def get_output_alt(filename: str):
    """兼容路径"""
    return get_output(filename)


# ─── 入口 ────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import socket

    def get_local_ip():
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    local_ip = get_local_ip()
    port     = 5000

    logger.info("=" * 60)
    logger.info("  🌙  声音克隆睡前故事智能体")
    logger.info("=" * 60)
    logger.info(f"  本机访问:   http://localhost:{port}")
    logger.info(f"  📱 手机访问:   http://{local_ip}:{port}")
    logger.info(f"  （小程序需填写后端地址为上述 URL）")
    logger.info("=" * 60)

    api_key = os.getenv("DASHSCOPE_API_KEY", "")
    if not api_key or api_key == "your_dashscope_api_key_here":
        logger.warning("⚠️  未配置 DASHSCOPE_API_KEY，请在 .env 文件中设置")
    else:
        logger.info("✅ DASHSCOPE_API_KEY 已配置")

    app.run(host="0.0.0.0", port=port, debug=False)
