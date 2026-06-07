// pages/index/index.js - 主页逻辑（直连 DashScope，无需后端）
const recorderManager = wx.getRecorderManager();
const innerAudioContext = wx.createInnerAudioContext();
const dashscope = require('../../utils/dashscope.js');

Page({
  data: {
    // API Key 状态
    hasApiKey: false,
    showApiKeyDialog: false,
    inputApiKey: '',

    // 声音相关
    isRecording: false,
    isPlayingSample: false,
    voiceUploaded: false,
    voiceFileName: '',
    voiceDuration: 0,
    voiceFilePath: '',
    recordingTime: 0,
    recordingTimer: null,

    // 故事主题
    themes: ['星月童话', '森林晚会', '海底探险', '太空漫游', '魔法森林', '勇敢小熊'],
    selectedTheme: '',
    customTheme: '',

    // 故事长度
    lengthOptions: [
      { label: '短篇', value: 'short', desc: '约1分钟' },
      { label: '中篇', value: 'medium', desc: '约2分钟' },
      { label: '长篇', value: 'long', desc: '约4分钟' }
    ],
    storyLength: 'medium',

    // 生成状态
    isGenerating: false,
    generateProgress: 0,
    loadingText: '正在准备...',
    currentStep: 0,

    // 生成结果
    generatedStory: '',
    audioFilePath: '',
    isPlayingStory: false,
    audioDuration: 0,
    audioCurrentTime: 0,
    audioCurrentTimeText: '00:00',
    audioDurationText: '00:00',
    audioTimer: null,

    // 音色 ID
    _voiceId: ''
  },

  onLoad() {
    this.initRecorder();
    this.initAudioPlayer();
    // 检查是否已有 API Key
    const apiKey = dashscope.getApiKey();
    if (apiKey) {
      this.setData({ hasApiKey: true });
    } else {
      this.setData({ showApiKeyDialog: true, hasApiKey: false });
    }
  },

  onUnload() {
    this.stopRecordingTimer();
    this.stopAudioTimer();
    innerAudioContext.destroy();
  },

  // ─── API Key 管理 ────────────────────────────────
  showApiKeyInput() {
    this.setData({ showApiKeyDialog: true, inputApiKey: dashscope.getApiKey() || '' });
  },

  onApiKeyInput(e) {
    this.setData({ inputApiKey: e.detail.value });
  },

  confirmApiKey() {
    const key = this.data.inputApiKey.trim();
    if (!key) {
      wx.showToast({ title: '请输入 API Key', icon: 'none' });
      return;
    }
    dashscope.setApiKey(key);
    this.setData({ hasApiKey: true, showApiKeyDialog: false });
    wx.showToast({ title: 'API Key 已保存', icon: 'success' });
  },

  cancelApiKey() {
    if (dashscope.getApiKey()) {
      this.setData({ showApiKeyDialog: false });
    } else {
      wx.showToast({ title: '需要 API Key 才能使用', icon: 'none' });
    }
  },

  // ─── 工具函数 ────────────────────────────────
  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  },

  // ─── 录音功能 ────────────────────────────────
  initRecorder() {
    recorderManager.onStart(() => {
      console.log('录音开始');
      this.setData({ isRecording: true, recordingTime: 0 });
      this.startRecordingTimer();
    });

    recorderManager.onStop((res) => {
      console.log('录音结束', res);
      this.setData({
        isRecording: false,
        voiceUploaded: true,
        voiceFilePath: res.tempFilePath,
        voiceFileName: '录音样本_' + new Date().getTime() + '.mp3',
        voiceDuration: Math.round(res.duration / 1000)
      });
      this.stopRecordingTimer();
      // 自动上传并克隆声音
      this.uploadAndCloneVoice(res.tempFilePath);
    });

    recorderManager.onError((err) => {
      console.error('录音错误', err);
      wx.showToast({ title: '录音失败', icon: 'none' });
      this.setData({ isRecording: false });
      this.stopRecordingTimer();
    });
  },

  toggleRecord() {
    if (this.data.isRecording) {
      recorderManager.stop();
    } else {
      if (!this.data.hasApiKey) {
        this.showApiKeyInput();
        return;
      }
      wx.authorize({
        scope: 'scope.record',
        success: () => {
          recorderManager.start({
            duration: 30000,
            sampleRate: 16000,
            numberOfChannels: 1,
            format: 'mp3',
            frameSize: 1
          });
        },
        fail: () => {
          wx.showModal({
            title: '需要录音权限',
            content: '请在设置中开启录音权限',
            confirmText: '去设置',
            success(res) {
              if (res.confirm) wx.openSetting();
            }
          });
        }
      });
    }
  },

  startRecordingTimer() {
    this._recTimer = setInterval(() => {
      if (this.data.recordingTime < 30) {
        this.setData({ recordingTime: this.data.recordingTime + 1 });
      }
    }, 1000);
  },

  stopRecordingTimer() {
    if (this._recTimer) {
      clearInterval(this._recTimer);
      this._recTimer = null;
    }
  },

  // ─── 文件选择与上传 ────────────────────────────────
  chooseVoiceFile() {
    if (!this.data.hasApiKey) {
      this.showApiKeyInput();
      return;
    }
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['mp3', 'wav', 'm4a', 'aac', 'flac'],
      success: (res) => {
        const file = res.tempFiles[0];
        this.setData({
          voiceUploaded: true,
          voiceFilePath: file.path,
          voiceFileName: file.name,
          voiceDuration: Math.round(file.size / 32000)
        });
        this.uploadAndCloneVoice(file.path, file.name);
      },
      fail: () => {
        wx.chooseMedia({
          count: 1,
          mediaType: ['file'],
          success: (res) => {
            const file = res.tempFiles[0];
            this.setData({
              voiceUploaded: true,
              voiceFilePath: file.tempFilePath,
              voiceFileName: 'upload_' + new Date().getTime() + '.mp3',
              voiceDuration: Math.round(file.duration / 1000)
            });
            this.uploadAndCloneVoice(file.tempFilePath, 'upload_' + new Date().getTime() + '.mp3');
          }
        });
      }
    });
  },

  /**
   * 上传音频到 DashScope 并克隆声音
   */
  uploadAndCloneVoice(filePath, fileName) {
    wx.showLoading({ title: '正在上传声音样本...' });
    this.setData({ uploading: true });

    // Step 1: 上传文件到 DashScope
    dashscope.uploadVoiceFile(filePath)
      .then((fileId) => {
        wx.showLoading({ title: '正在克隆声音...' });
        console.log('[声伴] 上传成功，file_id:', fileId);

        // Step 2: 克隆声音
        const voiceName = fileName || ('voice_' + new Date().getTime());
        return dashscope.cloneVoice(fileId, voiceName);
      })
      .then((voiceId) => {
        wx.hideLoading();
        this.data._voiceId = voiceId;
        this.setData({
          uploading: false,
          voiceUploaded: true
        });
        wx.showToast({ title: '声音克隆成功！', icon: 'success' });
        console.log('[声伴] 声音克隆成功，voice_id:', voiceId);

        // Step 3: 等待音色部署就绪
        return dashscope.waitVoiceReady(voiceId, 180);
      })
      .then(() => {
        console.log('[声伴] 音色部署完成，可以生成故事了');
        wx.showToast({ title: '音色已就绪，可以生成故事啦！', icon: 'none' });
      })
      .catch((err) => {
        wx.hideLoading();
        this.setData({ uploading: false });
        console.error('[声伴] 声音处理失败:', err);
        wx.showModal({
          title: '声音处理失败',
          content: String(err.message || err),
          showCancel: false
        });
      });
  },

  playVoiceSample() {
    if (this.data.isPlayingSample) {
      innerAudioContext.stop();
      this.setData({ isPlayingSample: false });
      return;
    }
    if (!this.data.voiceFilePath) return;
    innerAudioContext.src = this.data.voiceFilePath;
    innerAudioContext.play();
    this.setData({ isPlayingSample: true });
    innerAudioContext.onEnded(() => {
      this.setData({ isPlayingSample: false });
    });
  },

  deleteVoiceSample() {
    this.setData({
      voiceUploaded: false,
      voiceFileName: '',
      voiceDuration: 0,
      voiceFilePath: '',
      isPlayingSample: false,
      _voiceId: ''
    });
  },

  // ─── 主题选择 ────────────────────────────────
  selectTheme(e) {
    const theme = e.currentTarget.dataset.theme;
    this.setData({
      selectedTheme: this.data.selectedTheme === theme ? '' : theme,
      customTheme: ''
    });
  },

  onCustomThemeInput(e) {
    this.setData({
      customTheme: e.detail.value,
      selectedTheme: ''
    });
  },

  onCustomThemeConfirm(e) {
    this.setData({ selectedTheme: e.detail.value });
  },

  // ─── 长度选择 ────────────────────────────────
  selectLength(e) {
    this.setData({ storyLength: e.currentTarget.dataset.value });
  },

  // ─── 生成故事 ────────────────────────────────
  generateStory() {
    if (!this.data.hasApiKey) {
      this.showApiKeyInput();
      return;
    }
    if (!this.data.voiceUploaded || !this.data._voiceId) {
      wx.showToast({ title: '请先上传声音样本', icon: 'none' });
      return;
    }

    const theme = this.data.customTheme || this.data.selectedTheme;
    if (!theme) {
      wx.showToast({ title: '请选择或输入故事主题', icon: 'none' });
      return;
    }

    const lengthMap = { short: 300, medium: 600, long: 1200 };
    const wordCount = lengthMap[this.data.storyLength] || 600;

    this.setData({
      isGenerating: true,
      generateProgress: 0,
      loadingText: '正在生成故事内容...',
      currentStep: 1,
      generatedStory: '',
      audioFilePath: ''
    });

    this.simulateProgress();

    // Step 1: 生成故事文本
    wx.showLoading({ title: '正在创作故事...' });
    dashscope.generateStory(theme, wordCount)
      .then((storyText) => {
        wx.hideLoading();
        console.log('[声伴] 故事生成成功，字数:', storyText.length);
        this.setData({
          generateProgress: 60,
          loadingText: '正在合成语音...',
          currentStep: 2,
          generatedStory: storyText
        });

        // Step 2: 合成音频
        wx.showLoading({ title: '正在合成语音...' });
        return dashscope.synthesizeAudio(this.data._voiceId, storyText);
      })
      .then((audioPath) => {
        wx.hideLoading();
        this.setData({
          isGenerating: false,
          generateProgress: 100,
          loadingText: '完成！',
          currentStep: 3,
          audioFilePath: audioPath
        });
        this.stopProgressTimer();
        this.saveToHistory(this.data.generatedStory, theme);
        wx.showToast({ title: '故事生成完成！', icon: 'success' });
        // 自动播放
        setTimeout(() => this.togglePlayStory(), 800);
      })
      .catch((err) => {
        wx.hideLoading();
        this.stopProgressTimer();
        this.setData({ isGenerating: false, currentStep: 0 });
        console.error('[声伴] 生成失败:', err);
        wx.showModal({
          title: '生成失败',
          content: String(err.message || err),
          showCancel: false
        });
      });
  },

  simulateProgress() {
    let progress = 0;
    this._progTimer = setInterval(() => {
      if (!this.data.isGenerating) {
        clearInterval(this._progTimer);
        this._progTimer = null;
        return;
      }
      if (progress < 30) {
        progress += 2;
        this.setData({ generateProgress: progress, loadingText: '正在生成故事内容...', currentStep: 1 });
      } else if (progress < 60) {
        progress += 1.5;
        this.setData({ generateProgress: progress, loadingText: '正在合成语音...', currentStep: 2 });
      } else if (progress < 90) {
        progress += 0.8;
        this.setData({ generateProgress: progress });
      }
    }, 500);
  },

  stopProgressTimer() {
    if (this._progTimer) {
      clearInterval(this._progTimer);
      this._progTimer = null;
    }
  },

  // ─── 音频播放 ────────────────────────────────
  initAudioPlayer() {
    innerAudioContext.onPlay(() => {
      this.setData({
        isPlayingStory: true,
        audioCurrentTimeText: this.formatTime(Math.floor(innerAudioContext.currentTime))
      });
      this.startAudioTimer();
    });

    innerAudioContext.onPause(() => {
      this.setData({ isPlayingStory: false });
      this.stopAudioTimer();
    });

    innerAudioContext.onStop(() => {
      this.setData({ isPlayingStory: false, audioCurrentTime: 0, audioCurrentTimeText: '00:00' });
      this.stopAudioTimer();
    });

    innerAudioContext.onEnded(() => {
      this.setData({ isPlayingStory: false, audioCurrentTime: 0, audioCurrentTimeText: '00:00' });
      this.stopAudioTimer();
    });

    innerAudioContext.onTimeUpdate(() => {
      const t = Math.floor(innerAudioContext.currentTime);
      this.setData({
        audioCurrentTime: t,
        audioCurrentTimeText: this.formatTime(t)
      });
    });

    innerAudioContext.onDurationChange(() => {
      const d = Math.floor(innerAudioContext.duration) || 0;
      this.setData({
        audioDuration: d,
        audioDurationText: this.formatTime(d)
      });
    });
  },

  togglePlayStory() {
    if (this.data.isPlayingStory) {
      innerAudioContext.pause();
    } else {
      if (!this.data.audioFilePath) return;
      innerAudioContext.src = this.data.audioFilePath;
      innerAudioContext.play();
    }
  },

  replayStory() {
    innerAudioContext.stop();
    innerAudioContext.play();
  },

  onSliderChange(e) {
    const time = e.detail.value;
    innerAudioContext.seek(time);
    this.setData({ audioCurrentTime: time, audioCurrentTimeText: this.formatTime(time) });
  },

  startAudioTimer() {
    this._audioTimer = setInterval(() => {
      this.setData({
        audioCurrentTime: Math.floor(innerAudioContext.currentTime),
        audioCurrentTimeText: this.formatTime(Math.floor(innerAudioContext.currentTime))
      });
    }, 1000);
  },

  stopAudioTimer() {
    if (this._audioTimer) {
      clearInterval(this._audioTimer);
      this._audioTimer = null;
    }
  },

  saveStory() {
    if (!this.data.audioFilePath) return;
    wx.saveFileToDisk({
      tempFilePath: this.data.audioFilePath,
      fileName: '声伴故事_' + new Date().getTime() + '.mp3',
      success: () => wx.showToast({ title: '已保存', icon: 'success' }),
      fail: () => wx.showToast({ title: '保存失败', icon: 'none' })
    });
  },

  // ─── 历史记录 ────────────────────────────────
  saveToHistory(story, theme) {
    let history = wx.getStorageSync('storyHistory') || [];
    history.unshift({
      id: new Date().getTime(),
      theme: theme,
      story: story.substring(0, 100) + '...',
      fullStory: story,
      audioUrl: this.data.audioFilePath,
      time: new Date().toLocaleString()
    });
    if (history.length > 50) history = history.slice(0, 50);
    wx.setStorageSync('storyHistory', history);
  }
});
