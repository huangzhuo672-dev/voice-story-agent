// pages/index/index.js - 主页逻辑
const app = getApp();
const recorderManager = wx.getRecorderManager();
const innerAudioContext = wx.createInnerAudioContext();

Page({
  data: {
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
    audioTimer: null
  },

  onLoad() {
    this.initRecorder();
    this.initAudioPlayer();
  },

  onUnload() {
    this.stopRecordingTimer();
    this.stopAudioTimer();
    innerAudioContext.destroy();
  },

  // ─── 工具函数 ─────────────────────────────────
  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  },

  // ─── 录音功能 ─────────────────────────────────
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
      this.uploadVoiceFile(res.tempFilePath, 'recording_' + new Date().getTime() + '.mp3');
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

  // ─── 文件上传 ─────────────────────────────────
  chooseVoiceFile() {
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
        this.uploadVoiceFile(file.path, file.name);
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
            this.uploadVoiceFile(file.tempFilePath, 'upload_' + new Date().getTime() + '.mp3');
          }
        });
      }
    });
  },

  uploadVoiceFile(filePath, fileName) {
    wx.showLoading({ title: '上传声音样本...' });
    const apiUrl = app.globalData.apiUrl;

    wx.uploadFile({
      url: apiUrl + '/api/upload-voice',
      filePath: filePath,
      name: 'audio',
      formData: { filename: fileName },
      success: (res) => {
        wx.hideLoading();
        try {
          const data = JSON.parse(res.data);
          if (data.success) {
            this._voiceId = data.voiceId;
            wx.showToast({ title: '声音样本已上传', icon: 'success' });
          } else {
            wx.showToast({ title: data.error || '上传失败', icon: 'none' });
          }
        } catch (e) {
          wx.showToast({ title: '上传失败', icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('上传失败', err);
        wx.showToast({ title: '上传失败，请检查网络', icon: 'none' });
      }
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
      isPlayingSample: false
    });
    this._voiceId = null;
  },

  // ─── 主题选择 ─────────────────────────────────
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

  // ─── 长度选择 ─────────────────────────────────
  selectLength(e) {
    this.setData({ storyLength: e.currentTarget.dataset.value });
  },

  // ─── 生成故事 ─────────────────────────────────
  generateStory() {
    if (!this.data.voiceUploaded) {
      wx.showToast({ title: '请先上传声音样本', icon: 'none' });
      return;
    }

    const theme = this.data.customTheme || this.data.selectedTheme;
    if (!theme) {
      wx.showToast({ title: '请选择或输入故事主题', icon: 'none' });
      return;
    }

    if (!this._voiceId) {
      wx.showToast({ title: '声音样本未上传完成，请重试', icon: 'none' });
      return;
    }

    this.setData({
      isGenerating: true,
      generateProgress: 0,
      loadingText: '正在克隆声音...',
      currentStep: 1,
      generatedStory: '',
      audioFilePath: ''
    });

    const apiUrl = app.globalData.apiUrl;
    const storyLengthMap = { short: 300, medium: 600, long: 1200 };

    wx.request({
      url: apiUrl + '/api/generate-story',
      method: 'POST',
      header: { 'content-type': 'application/json' },
      data: {
        voiceId: this._voiceId,
        theme: theme,
        length: storyLengthMap[this.data.storyLength] || 600
      },
      success: (res) => {
        if (res.data && res.data.success) {
          this.setData({
            isGenerating: false,
            generatedStory: res.data.story,
            audioFilePath: apiUrl + '/output/' + res.data.audioFile,
            generateProgress: 100,
            currentStep: 3
          });
          this.saveToHistory(res.data.story, theme);
          wx.showToast({ title: '故事生成完成！', icon: 'success' });
          setTimeout(() => this.togglePlayStory(), 500);
        } else {
          this.onGenerateFail(res.data ? res.data.error : '生成失败');
        }
      },
      fail: (err) => {
        console.error('生成失败', err);
        this.onGenerateFail('网络错误，请检查后端服务是否启动');
      }
    });

    this.simulateProgress();
  },

  simulateProgress() {
    let progress = 0;
    this._progTimer = setInterval(() => {
      if (progress < 30) {
        progress += 2;
        this.setData({
          generateProgress: progress,
          loadingText: '正在克隆声音...',
          currentStep: 1
        });
      } else if (progress < 60) {
        progress += 1.5;
        this.setData({
          generateProgress: progress,
          loadingText: '正在生成故事内容...',
          currentStep: 2
        });
      } else if (progress < 90) {
        progress += 1;
        this.setData({
          generateProgress: progress,
          loadingText: '正在合成语音...',
          currentStep: 3
        });
      }
      if (!this.data.isGenerating) {
        clearInterval(this._progTimer);
        this._progTimer = null;
      }
    }, 500);
  },

  onGenerateFail(msg) {
    clearInterval(this._progTimer);
    this._progTimer = null;
    this.setData({ isGenerating: false, currentStep: 0 });
    wx.showModal({
      title: '生成失败',
      content: msg || '请稍后重试',
      showCancel: false
    });
  },

  // ─── 音频播放 ─────────────────────────────────
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
    wx.downloadFile({
      url: this.data.audioFilePath,
      success: (res) => {
        wx.saveFileToDisk({
          filePath: res.tempFilePath,
          fileName: '睡前故事_' + new Date().getTime() + '.mp3',
          success: () => wx.showToast({ title: '已保存', icon: 'success' }),
          fail: () => wx.showToast({ title: '保存失败', icon: 'none' })
        });
      }
    });
  },

  // ─── 历史记录 ─────────────────────────────────
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
