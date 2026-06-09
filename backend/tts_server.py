"""
声伴 TTS 后端 - 单文件，纯标准库 + dashscope
启动：python tts_server.py
"""
import json, os, io
from http.server import HTTPServer, BaseHTTPRequestHandler

# 配置 API Key
API_KEY = os.environ.get('DASHSCOPE_API_KEY', 'sk-8e44102f47fc4c6e842690b5f0c82e90')

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != '/tts':
            self.send_error(404); return
        try:
            length = int(self.headers.get('Content-Length', 0))
            raw = self.rfile.read(length)
            body = json.loads(raw.decode('utf-8', errors='replace'))
            vid = body.get('voiceId', '')
            txt = body.get('text', '')
            api_key = self.headers.get('X-Api-Key') or API_KEY

            import dashscope
            dashscope.api_key = api_key

            from dashscope.audio.tts_v2 import SpeechSynthesizer, AudioFormat
            model = 'cosyvoice-v3-plus' if 'cosyvoice-v3' in vid else 'cosyvoice-v1'
            synth = SpeechSynthesizer(model=model, voice=vid,
                                      format=AudioFormat.MP3_22050HZ_MONO_256KBPS)
            audio = synth.call(txt)
            if audio is None:
                self.send_response(500); self.end_headers()
                self.wfile.write(b'{"error":"TTS returned empty"}')
                return

            self.send_response(200)
            self.send_header('Content-Type', 'audio/mpeg')
            self.send_header('Content-Length', str(len(audio)))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(audio)
            print(f'[OK] {len(audio)} bytes')
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    def log_message(self, fmt, *args):
        pass  # 安静模式

if __name__ == '__main__':
    server = HTTPServer(('0.0.0.0', 5099), Handler)
    print('[声伴TTS后端] 启动在 http://localhost:5099')
    server.serve_forever()
