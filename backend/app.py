"""
声伴 TTS 后端 — 精简版
只提供 TTS 语音合成服务
"""
import os
import json
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler
import dashscope
from dashscope.audio.tts_v2 import SpeechSynthesizer, AudioFormat

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

API_KEY = os.getenv("DASHSCOPE_API_KEY", "")
if API_KEY:
    dashscope.api_key = API_KEY
    logger.info("DashScope API Key 已配置")
else:
    logger.warning("未配置 DASHSCOPE_API_KEY")


def do_tts(voice_id: str, text: str):
    """调用 DashScope Python SDK 合成语音，返回音频二进制数据"""
    # 自动选择模型
    if voice_id.startswith("cosyvoice-v3") or voice_id.startswith("cosyvoice-v3.5"):
        model = "cosyvoice-v3-plus"
    else:
        model = "cosyvoice-v1"

    logger.info(f"TTS: model={model}, voice={voice_id}, text_len={len(text)}")
    synthesizer = SpeechSynthesizer(
        model=model,
        voice=voice_id,
        format=AudioFormat.MP3_22050HZ_MONO_256KBPS
    )
    audio = synthesizer.call(text)
    if audio is None:
        raise RuntimeError("TTS 返回空音频")
    return audio


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        logger.info(fmt % args)

    def _send_json(self, code, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()
        self.wfile.write(body)

    def _send_binary(self, code, data, mime="audio/mpeg"):
        self.send_response(code)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        if self.path == "/health" or self.path == "/api/health":
            self._send_json(200, {
                "status": "ok",
                "api_key": bool(API_KEY),
                "service": "声伴 TTS 后端"
            })
        else:
            self._send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/tts":
            self._send_json(404, {"error": "not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            body = json.loads(raw.decode("utf-8", errors="replace"))
        except Exception as e:
            self._send_json(400, {"error": f"JSON 解析失败: {e}"})
            return

        voice_id = body.get("voiceId", "")
        text = body.get("text", "")

        if not voice_id:
            self._send_json(400, {"error": "缺少 voiceId"})
            return
        if not text:
            self._send_json(400, {"error": "缺少 text"})
            return

        if not API_KEY:
            self._send_json(500, {"error": "服务端未配置 API Key"})
            return

        try:
            audio = do_tts(voice_id, text)
            self._send_binary(200, audio)
            logger.info(f"TTS 成功: {len(audio)} bytes")
        except Exception as e:
            logger.error(f"TTS 失败: {e}")
            self._send_json(500, {"error": f"TTS 失败: {e}"})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    srv = HTTPServer(("0.0.0.0", port), Handler)
    logger.info(f"声伴 TTS 后端启动: http://0.0.0.0:{port}")
    srv.serve_forever()
