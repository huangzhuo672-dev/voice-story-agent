/**
 * DashScope API 封装 — 声音设计 + 故事生成 + 语音合成
 * 声伴 v2.0 | 用你理想的声音，伴你入眠
 * 文档：https://help.aliyun.com/zh/model-studio/
 */

const BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';

// 取值：中文语速约 250 字/分钟
const CHARS_PER_MINUTE = 250;
const MAX_MINUTES = 60;
const MAX_CHARS = Math.round(CHARS_PER_MINUTE * MAX_MINUTES); // 15,000

// ── API Key ──────────────────────────────────────────
function setApiKey(key) {
  wx.setStorageSync('apiKey', key);
}
function getApiKey() {
  return wx.getStorageSync('apiKey') || '';
}

// ── 请求封装 ──────────────────────────────────────────
function apiPost(path, data, responseType) {
  var opts = {
    url: BASE_URL + path,
    method: 'POST',
    timeout: 180000,
    header: {
      'Authorization': 'Bearer ' + getApiKey(),
      'Content-Type': 'application/json'
    },
    data: data,
    success: null,
    fail: null
  };
  if (responseType) opts.responseType = responseType;
  return new Promise(function (resolve, reject) {
    opts.success = function (res) {
      if (res.statusCode === 200) resolve(res);
      else reject(new Error('API 请求失败 (' + res.statusCode + '): ' + JSON.stringify(res.data)));
    };
    opts.fail = function (err) {
      reject(new Error('网络请求失败: ' + (err.errMsg || JSON.stringify(err))));
    };
    wx.request(opts);
  });
}

// ── 声音设计 ──────────────────────────────────────────
/**
 * 根据文字描述创建定制音色
 * @param {string} voicePrompt   - 声音特征描述，最长500字
 * @param {string} previewText   - 预览文本（用于生成试听）
 * @param {string} prefix        - 音色名称前缀
 * @returns {Promise<{voiceId:string, previewAudio:string}>}
 */
function createVoice(voicePrompt, previewText, prefix) {
  prefix = prefix || 'sb';
  previewText = previewText || '你好，我是声伴，将用温柔的声音为你讲述睡前故事。';
  return apiPost('/services/audio/tts/customization', {
    model: 'voice-enrollment',
    input: {
      action: 'create_voice',
      target_model: 'cosyvoice-v3-plus',
      voice_prompt: voicePrompt,
      preview_text: previewText,
      prefix: prefix,
      language_hints: ['zh']
    },
    parameters: {
      sample_rate: 24000,
      response_format: 'mp3'
    }
  }).then(function (res) {
    var output = res.data.output || {};
    if (!output.voice_id) {
      throw new Error('声音创建失败: ' + JSON.stringify(res.data));
    }
    return {
      voiceId: output.voice_id,
      previewAudio: output.preview_audio ? output.preview_audio.data : null,
      targetModel: output.target_model
    };
  });
}

/**
 * 查询音色状态
 * @param {string} voiceId
 * @returns {Promise<string>} DEPLOYING | OK | UNDEPLOYED | FAILED
 */
function queryVoiceStatus(voiceId) {
  return apiPost('/services/audio/tts/customization', {
    model: 'voice-enrollment',
    input: {
      action: 'query_voice',
      voice_id: voiceId
    }
  }).then(function (res) {
    var output = res.data.output || {};
    return output.status || '';
  });
}

/**
 * 轮询等待音色部署就绪
 * @param {string} voiceId
 * @param {number} maxWaitSec
 * @returns {Promise<boolean>}
 */
function waitVoiceReady(voiceId, maxWaitSec) {
  maxWaitSec = maxWaitSec || 300;
  var start = Date.now();
  return new Promise(function (resolve, reject) {
    (function check() {
      if (Date.now() - start > maxWaitSec * 1000) {
        return reject(new Error('音色部署超时，请稍后重试'));
      }
      queryVoiceStatus(voiceId).then(function (status) {
        console.log('[声伴] 音色状态:', status);
        if (status === 'OK') resolve(true);
        else if (status === 'FAILED' || status === 'UNDEPLOYED') reject(new Error('音色审核未通过，请尝试其他描述'));
        else setTimeout(check, 5000);
      }).catch(function () {
        setTimeout(check, 5000);
      });
    })();
  });
}

// ── 故事生成 ──────────────────────────────────────────
/**
 * 调用 Qwen 生成睡前故事
 * @param {string} customDesc   - 用户自定义故事描述
 * @param {string} category     - 故事分类（可选，与customDesc二选一）
 * @param {number} lengthChars  - 故事字数
 * @returns {Promise<string>}   故事文本
 */
function generateStory(customDesc, category, lengthChars) {
  lengthChars = Math.min(lengthChars || 1250, MAX_CHARS);
  var systemPrompt = (
    '你是一位优秀的睡前故事创作者。创作优美、舒缓、温暖的睡前故事，帮助听众放松身心，安然入睡。\n' +
    '要求：语言优美流畅、节奏舒缓、情节温暖治愈、充满想象力但不刺激、结尾温馨有安全感。\n' +
    '禁止：恐怖、惊悚、悲伤、暴力情节，禁止过于复杂的设定。\n' +
    '直接输出故事正文，用小段落分隔，适合逐段朗读。不要标题、不要引号包裹、不要前言后记。'
  );

  var userPrompt;
  if (customDesc && customDesc.trim()) {
    userPrompt = '请根据以下描述创作睡前故事：' + customDesc.trim() + '\n故事长度约 ' + lengthChars + ' 字。请直接开始讲故事。';
  } else {
    var cat = category || '温暖治愈';
    userPrompt = '创作一篇' + cat + '风格的睡前故事。故事长度约 ' + lengthChars + ' 字。请直接开始讲故事。';
  }

  return apiPost('/services/aigc/text-generation/generation', {
    model: 'qwen-max',
    input: {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    },
    parameters: { result_format: 'message' }
  }).then(function (res) {
    var choices = res.data.output && res.data.output.choices;
    var text = (choices && choices[0] && choices[0].message && choices[0].message.content) || '';
    if (!text) throw new Error('故事生成失败，响应为空');
    console.log('[声伴] 故事生成成功，字数:', text.length);
    return text;
  });
}

// ── 语音合成 ──────────────────────────────────────────
/**
 * TTS 语音合成（支持长文本分段合成）
 * @param {string} voiceId  - 声音设计产生的 voice_id
 * @param {string} text     - 故事文本
 * @returns {Promise<string>} 本地临时音频路径
 */
function synthesizeAudio(voiceId, text) {
  if (!text || !text.trim()) return Promise.resolve([]);
  // 长文本分段（每段最多 2000 字，避免单次请求过大）
  var maxChunk = 2000;
  if (text.length <= maxChunk) {
    return synthesizeChunk(voiceId, text).then(function (path) {
      return [path];
    });
  }
  // 按段落边界分段
  var chunks = splitText(text, maxChunk);
  console.log('[声伴] 文本分为 ' + chunks.length + ' 段合成');
  var results = [];
  return chunks.reduce(function (chain, chunk) {
    return chain.then(function () {
      return synthesizeChunk(voiceId, chunk).then(function (path) {
        results.push(path);
      });
    });
  }, Promise.resolve()).then(function () {
    // 简单拼接：返回最后一段的路径作为主路径，存储全部段
    // 实际播放需逐段切换，这里先简化：返回所有路径数组
    // 播放器在 index.js 里处理多段
    return results;
  });
}

function synthesizeChunk(voiceId, text) {
  return new Promise(function (resolve, reject) {
    wx.request({
      url: BASE_URL + '/services/audio/tts/speech',
      method: 'POST',
      timeout: 180000,
      responseType: 'arraybuffer',
      header: {
        'Authorization': 'Bearer ' + getApiKey(),
        'Content-Type': 'application/json'
      },
      data: {
        model: 'cosyvoice-v3-plus',
        input: { text: text },
        parameters: {
          voice: voiceId,
          response_format: 'mp3',
          sample_rate: 22050
        }
      },
      success: function (res) {
        if (res.statusCode === 200 && res.data) {
          var fs = wx.getFileSystemManager();
          var path = wx.env.USER_DATA_PATH + '/chunk_' + Date.now() + '_' + Math.random().toString(36).slice(2,6) + '.mp3';
          try {
            fs.writeFileSync(path, res.data, 'binary');
            resolve(path);
          } catch (e) {
            reject(new Error('保存音频失败: ' + e.message));
          }
        } else {
          reject(new Error('TTS 失败 (' + res.statusCode + '): ' + JSON.stringify(res.data || {}).substring(0, 300)));
        }
      },
      fail: function (err) {
        reject(new Error('TTS 请求失败: ' + (err.errMsg || JSON.stringify(err))));
      }
    });
  });
}

function splitText(text, maxLen) {
  var chunks = [];
  var paragraphs = text.split(/\n+/);
  var current = '';
  for (var i = 0; i < paragraphs.length; i++) {
    var p = paragraphs[i].trim();
    if (!p) continue;
    if (current && (current.length + p.length > maxLen)) {
      chunks.push(current.trim());
      current = p;
    } else {
      current = current ? current + '\n' + p : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  if (chunks.length === 0) chunks.push(text);
  return chunks;
}

// ── 导出 ──────────────────────────────────────────────
module.exports = {
  CHARS_PER_MINUTE: CHARS_PER_MINUTE,
  MAX_MINUTES: MAX_MINUTES,
  MAX_CHARS: MAX_CHARS,
  setApiKey: setApiKey,
  getApiKey: getApiKey,
  createVoice: createVoice,
  queryVoiceStatus: queryVoiceStatus,
  waitVoiceReady: waitVoiceReady,
  generateStory: generateStory,
  synthesizeAudio: synthesizeAudio
};
