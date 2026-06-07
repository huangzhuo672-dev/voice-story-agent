/**
 * DashScope API 直接调用封装
 * 小程序直连阿里云，无需后端服务器
 * 文档：https://help.aliyun.com/zh/model-studio/
 */

const API_KEY = wx.getStorageSync('apiKey') || '';
const BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';

// 设置 API Key
function setApiKey(key) {
  wx.setStorageSync('apiKey', key);
}

// 获取存储的 API Key
function getApiKey() {
  return wx.getStorageSync('apiKey') || '';
}

/**
 * 上传音频文件到 DashScope
 * @param {string} filePath - 本地临时文件路径
 * @returns {Promise<string>} file_id 或 URL
 */
function uploadVoiceFile(filePath) {
  return new Promise((resolve, reject) => {
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath: filePath,
      encoding: 'base64',
      success(res) {
        // 使用 wx.request 直接 POST base64 数据，绕过 uploadFile 域名限制
        wx.request({
          url: BASE_URL + '/files',
          method: 'POST',
          header: {
            'Authorization': 'Bearer ' + getApiKey(),
            'Content-Type': 'application/json'
          },
          data: {
            mime_type: 'audio/mp3',
            purpose: 'voice-cloning',
            file_content: res.data
          },
          success(uploadRes) {
            if (uploadRes.statusCode === 200) {
              const fileId = uploadRes.data?.data?.uploaded_files?.[0]?.file_id ||
                             uploadRes.data?.file_id ||
                             uploadRes.data?.id;
              if (fileId) {
                console.log('[DashScope] 上传成功，file_id:', fileId);
                resolve(fileId);
              } else {
                reject(new Error('上传失败: 未返回 file_id，响应: ' + JSON.stringify(uploadRes.data)));
              }
            } else {
              reject(new Error('上传失败 (' + uploadRes.statusCode + '): ' + JSON.stringify(uploadRes.data)));
            }
          },
          fail(err) {
            reject(new Error('上传请求失败: ' + (err.errMsg || JSON.stringify(err))));
          }
        });
      },
      fail(err) {
        reject(new Error('读取文件失败: ' + err.errMsg));
      }
    });
  });
}

/**
 * 声音克隆 - 创建自定义音色
 * @param {string} fileId   - DashScope 文件 ID
 * @param {string} voiceName - 音色名称
 * @returns {Promise<string>} voice_id
 */
function cloneVoice(fileId, voiceName) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: BASE_URL + '/services/audio/tts/customization',
      method: 'POST',
      header: {
        'Authorization': 'Bearer ' + getApiKey(),
        'Content-Type': 'application/json'
      },
      data: {
        model: 'voice-enrollment',
        action: 'create_voice',
        target_model: 'cosyvoice-v3.5-plus',
        prefix: 'storytime',
        voice_name: voiceName || 'default_voice',
        file_id: fileId,
        enable_preprocess: true,
        max_prompt_audio_length: 20.0
      },
      success(res) {
        if (res.statusCode === 200) {
          const voiceId = res.data?.output?.voice_id;
          if (voiceId) {
              console.log('[DashScope] 克隆成功，voice_id:', voiceId);
              resolve(voiceId);
            } else {
              reject(new Error('克隆失败: ' + JSON.stringify(res.data)));
            }
        } else {
          reject(new Error('克隆请求失败 (' + res.statusCode + '): ' + JSON.stringify(res.data)));
        }
      },
      fail(err) {
        reject(new Error('克隆请求失败: ' + (err.errMsg || JSON.stringify(err))));
      }
    });
  });
}

/**
 * 查询音色部署状态
 * @param {string} voiceId
 * @returns {Promise<boolean>} 是否就绪
 */
function waitVoiceReady(voiceId, maxWaitSec = 180) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const check = () => {
      if (Date.now() - startTime > maxWaitSec * 1000) {
        reject(new Error('音色部署超时，请重试'));
        return;
      }
      wx.request({
        url: BASE_URL + '/services/audio/tts/customization',
        method: 'POST',
        header: {
          'Authorization': 'Bearer ' + getApiKey(),
          'Content-Type': 'application/json'
        },
        data: {
          model: 'voice-enrollment',
          action: 'query_voice',
          voice_id: voiceId
        },
        success(res) {
          const status = res.data?.output?.status || '';
          console.log('[DashScope] 音色状态:', status);
          if (status === 'OK') {
            resolve(true);
          } else if (status === 'FAILED') {
            reject(new Error('音色部署失败'));
          } else {
            setTimeout(check, 5000);
          }
        },
        fail(err) {
          setTimeout(check, 5000);
        }
      });
    };
    check();
  });
}

/**
 * 调用 Qwen 生成故事文本
 * @param {string} theme
 * @param {number} lengthWords
 * @returns {Promise<string>} 故事文本
 */
function generateStory(theme, lengthWords = 600) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
      method: 'POST',
      header: {
        'Authorization': 'Bearer ' + getApiKey(),
        'Content-Type': 'application/json'
      },
      data: {
        model: 'qwen-max',
        input: {
          messages: [
            {
              role: 'system',
              content: '你是一位温柔的睡前故事讲述者，创作优美舒缓的睡前故事，帮助听众放松入睡。语言优美、节奏舒缓，充满想象力但不刺激。'
            },
            {
              role: 'user',
              content: `请创作一个以「${theme}」为主题的睡前故事。故事长度约 ${lengthWords} 字，语言优美舒缓，适合朗读，结尾温馨，避免使用恐怖、紧张情节。直接输出故事正文，不要标题，不要引号包裹。`
            }
          ]
        },
        parameters: {
          result_format: 'message'
        }
      },
      success(res) {
        if (res.statusCode === 200) {
          const text = res.data?.output?.choices?.[0]?.message?.content || '';
          if (text) {
            console.log('[DashScope] 故事生成成功，字数:', text.length);
            resolve(text);
          } else {
            reject(new Error('故事生成失败: 响应为空'));
          }
        } else {
          reject(new Error('故事生成失败 (' + res.statusCode + '): ' + JSON.stringify(res.data)));
        }
      },
      fail(err) {
        reject(new Error('故事生成请求失败: ' + (err.errMsg || JSON.stringify(err))));
      }
    });
  });
}

/**
 * 语音合成 - 用克隆的声音讲故事
 * @param {string} voiceId - 克隆的音色 ID
 * @param {string} text     - 故事文本
 * @returns {Promise<string>} 音频临时文件路径
 */
function synthesizeAudio(voiceId, text) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/generation',
      method: 'POST',
      header: {
        'Authorization': 'Bearer ' + getApiKey(),
        'Content-Type': 'application/json',
        'X-DashScope-Output-Type': 'binary'  // 直接返回音频二进制
      },
      responseType: 'arraybuffer',
      data: {
        model: 'cosyvoice-v3.5-plus',
        input: {
          voice: voiceId,
          text: text
        },
        parameters: {
          sample_rate: 22050,
          format: 'mp3'
        }
      },
      success(res) {
        if (res.statusCode === 200 && res.data) {
          // 保存音频到临时文件
          const fs = wx.getFileSystemManager();
          const tempPath = wx.env.USER_DATA_PATH + '/story_' + Date.now() + '.mp3';
          fs.writeFileSync(tempPath, res.data, 'binary');
          console.log('[DashScope] 音频合成成功:', tempPath);
          resolve(tempPath);
        } else {
          reject(new Error('音频合成失败 (' + res.statusCode + ')'));
        }
      },
      fail(err) {
        reject(new Error('音频合成请求失败: ' + (err.errMsg || JSON.stringify(err))));
      }
    });
  });
}

module.exports = {
  setApiKey,
  getApiKey,
  uploadVoiceFile,
  cloneVoice,
  waitVoiceReady,
  generateStory,
  synthesizeAudio
};
