// pages/index/index.js — 声伴 v2.0 声音设计版
var dashscope = require('../../utils/dashscope.js');
var innerAudioContext = null;

Page({
  data: {
    // API Key
    hasApiKey: false,
    showApiKeyDialog: false,
    inputApiKey: '',

    // ============ 声音设计 ============
    voiceStyles: [
      { id: 'gentle-female', emoji: '👩‍🦰', label: '温柔女声', prompt: '一位温柔的年轻女性，声音轻柔温暖，语速缓慢舒适，像妈妈在床边轻声细语，让人感到安心放松。适合讲述温馨睡前故事。', preview: '宝贝，闭上眼睛，听我给你讲一个温暖的故事……' },
      { id: 'deep-male',    emoji: '🧔', label: '深沉男声', prompt: '一位温和的中年男性，声音低沉磁性，语速平稳从容，像慈祥的长辈在讲故事，给人安全感。适合讲长篇睡前故事。', preview: '夜深了，让我用声音为你编织一个好梦……' },
      { id: 'warm-elder',   emoji: '👵', label: '慈祥长辈', prompt: '一位慈祥的长辈，声音和蔼温和，带着岁月沉淀的温暖，像奶奶在摇椅旁讲故事，让人感到无比安心。', preview: '孩子，躺好了，奶奶给你讲个故事……' },
      { id: 'clear-youth',  emoji: '🧑', label: '清朗少年', prompt: '一位清朗温和的青年，声音干净明亮，语调轻柔，像邻家大哥哥在夜色中低语，给人宁静陪伴感。', preview: '嘿，今晚让我陪你，讲一个安静的故事……' },
      { id: 'sweet-girl',   emoji: '👧', label: '甜美姐姐', prompt: '一位温柔的姐姐，声音甜美柔和，带着关怀的语气，像姐姐哄弟弟妹妹入睡，让人感到被爱和呵护。', preview: '乖，姐姐给你讲个故事，闭上眼睛哦……' },
      { id: 'calm-neutral', emoji: '🎧', label: '安静中性', prompt: '一位声音中性温和的讲述者，语气平和舒缓，不带明显性别特征，像深夜电台播音员，让人彻底放松。', preview: '在这个安静的夜晚，为你讲述一个温暖的故事……' }
    ],
    selectedVoiceStyle: '',
    voiceOnline: false,    // 音色是否部署完成
    voiceCreating: false,  // 音色创建中
    _voiceId: '',

    // ============ 故事设置 ============
    categories: [
      { id: 'fairy-tale',  label: '童话冒险',   desc: '经典童话风格' },
      { id: 'space',       label: '星空宇宙',   desc: '探索浩瀚宇宙' },
      { id: 'animal',      label: '动物世界',   desc: '可爱动物朋友' },
      { id: 'magic',       label: '魔法奇幻',   desc: '神秘的魔法世界' },
      { id: 'nature',      label: '自然治愈',   desc: '森林海洋的宁静' },
      { id: 'daily',       label: '日常温暖',   desc: '平凡中的小美好' },
      { id: 'friendship',  label: '友谊故事',   desc: '好朋友的温暖' },
      { id: 'growth',      label: '成长勇气',   desc: '勇敢面对挑战' }
    ],
    selectedCategory: '',
    customStoryDesc: '',

    // ============ 故事长度 ============
    storyMinutes: 10,   // 默认10分钟
    maxMinutes: 60,
    minMinutes: 1,
    storyWordCount: 2500, // 10min * 250 = 2500

    // ============ 定时关闭 ============
    timerMinutes: 0,     // 0 = 不定时
    timerOptions: [
      { label: '不定时',  value: 0 },
      { label: '15分钟', value: 15 },
      { label: '30分钟', value: 30 },
      { label: '45分钟', value: 45 },
      { label: '60分钟', value: 60 }
    ],
    timerRemaining: 0,
    timerRunning: false,
    timerDisplay: '',
    timerBarPercent: 100,

    // ============ 生成状态 ============
    isGenerating: false,
    generateProgress: 0,
    loadingText: '正在准备...',
    currentStep: 0,

    // ============ 播放结果 ============
    generatedStory: '',
    audioChunks: [],      // 多段音频路径
    currentChunkIndex: 0,
    isPlayingStory: false,
    audioDuration: 0,
    audioCurrentTime: 0,
    audioCurrentTimeText: '00:00',
    audioDurationText: '00:00',

    // 故事文本展开
    storyExpanded: false
  },

  // ==================== 生命周期 ====================
  onLoad: function () {
    innerAudioContext = wx.createInnerAudioContext();
    this.initAudioPlayer();
    var key = dashscope.getApiKey();
    if (key) this.setData({ hasApiKey: true });
    else this.setData({ showApiKeyDialog: true });
  },

  onUnload: function () {
    this.stopAllTimers();
    if (innerAudioContext) {
      innerAudioContext.destroy();
      innerAudioContext = null;
    }
  },

  // ==================== API Key ====================
  showApiKeyInput: function () {
    this.setData({ showApiKeyDialog: true, inputApiKey: dashscope.getApiKey() || '' });
  },
  onApiKeyInput: function (e) {
    this.setData({ inputApiKey: e.detail.value });
  },
  confirmApiKey: function () {
    var k = this.data.inputApiKey.trim();
    if (!k) { wx.showToast({ title: '请输入 API Key', icon: 'none' }); return; }
    dashscope.setApiKey(k);
    this.setData({ hasApiKey: true, showApiKeyDialog: false });
    wx.showToast({ title: 'API Key 已保存', icon: 'success' });
  },
  cancelApiKey: function () {
    if (dashscope.getApiKey()) this.setData({ showApiKeyDialog: false });
    else wx.showToast({ title: '需要 API Key', icon: 'none' });
  },

  // ==================== 工具 ====================
  formatTime: function (s) {
    if (!s || isNaN(s)) return '00:00';
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return (m < 10 ? '0' + m : m) + ':' + (sec < 10 ? '0' + sec : sec);
  },

  // ==================== 声音设计 ====================
  selectVoiceStyle: function (e) {
    var id = e.currentTarget.dataset.id;
    this.setData({ selectedVoiceStyle: id });
  },

  createVoiceNow: function () {
    if (!this.data.selectedVoiceStyle) {
      wx.showToast({ title: '请先选择一个声音风格', icon: 'none' });
      return;
    }
    if (!this.data.hasApiKey) { this.showApiKeyInput(); return; }
    var style = this.data.voiceStyles.find(function (s) { return s.id === this.data.selectedVoiceStyle; }.bind(this));
    if (!style) return;

    this.setData({ voiceCreating: true });
    wx.showLoading({ title: '正在创建声音...' });

    dashscope.createVoice(style.prompt, style.preview, 'sb')
      .then(function (res) {
        wx.hideLoading();
        this.setData({ _voiceId: res.voiceId });
        console.log('[声伴] 声音创建成功:', res.voiceId);
        wx.showToast({ title: '声音已创建，等待审核...', icon: 'none' });

        // 等待部署
        wx.showLoading({ title: '音色审核中(约30s)...' });
        return dashscope.waitVoiceReady(res.voiceId, 300);
      }.bind(this))
      .then(function () {
        wx.hideLoading();
        this.setData({ voiceCreating: false, voiceOnline: true });
        wx.showToast({ title: '音色就绪，可以生成故事啦！', icon: 'success' });
      }.bind(this))
      .catch(function (err) {
        wx.hideLoading();
        this.setData({ voiceCreating: false });
        console.error('[声伴] 声音创建失败:', err);
        wx.showModal({
          title: '声音创建失败',
          content: String(err.message || err),
          showCancel: false
        });
      }.bind(this));
  },

  // ==================== 故事分类 ====================
  selectCategory: function (e) {
    var id = e.currentTarget.dataset.id;
    // 支持取消选择
    this.setData({ selectedCategory: this.data.selectedCategory === id ? '' : id });
  },

  // 随机选择分类
  randomCategory: function () {
    var cats = this.data.categories;
    var idx = Math.floor(Math.random() * cats.length);
    this.setData({ selectedCategory: cats[idx].id });
    wx.showToast({ title: '随机选中: ' + cats[idx].label, icon: 'none', duration: 1200 });
  },

  // ==================== 自定义故事描述 ====================
  onStoryDescInput: function (e) {
    this.setData({ customStoryDesc: e.detail.value });
  },

  // ==================== 故事长度滑块 ====================
  onLengthChange: function (e) {
    var minutes = e.detail.value;
    this.setData({
      storyMinutes: minutes,
      storyWordCount: Math.round(minutes * dashscope.CHARS_PER_MINUTE)
    });
  },

  // ==================== 定时关闭 ====================
  selectTimer: function (e) {
    var val = Number(e.currentTarget.dataset.value);
    if (val === 0) {
      // 取消定时
      this.setData({
        timerMinutes: 0,
        timerRunning: false,
        timerRemaining: 0,
        timerDisplay: '',
        timerBarPercent: 100
      });
      this.stopTimerTicking();
    } else {
      this.setData({
        timerMinutes: val,
        timerRunning: true,
        timerRemaining: val * 60,
        timerDisplay: this.formatTime(val * 60),
        timerBarPercent: 100
      });
      this.startTimerTicking();
    }
  },

  startTimerTicking: function () {
    this.stopTimerTicking();
    var that = this;
    this._timerTicker = setInterval(function () {
      var remaining = that.data.timerRemaining - 1;
      if (remaining <= 0) {
        that.stopTimerTicking();
        that.setData({ timerRemaining: 0, timerDisplay: '00:00', timerBarPercent: 0, timerRunning: false });
        // 自动停止播放
        if (innerAudioContext) innerAudioContext.stop();
        that.setData({ isPlayingStory: false });
        wx.showToast({ title: '定时关闭，晚安 💤', icon: 'none' });
      } else {
        var percent = Math.round((remaining / (that.data.timerMinutes * 60)) * 100);
        that.setData({
          timerRemaining: remaining,
          timerDisplay: that.formatTime(remaining),
          timerBarPercent: percent
        });
      }
    }, 1000);
  },

  stopTimerTicking: function () {
    if (this._timerTicker) { clearInterval(this._timerTicker); this._timerTicker = null; }
  },

  // ==================== 生成故事 ====================
  onGenerate: function () {
    if (!this.data.hasApiKey) { this.showApiKeyInput(); return; }
    if (!this.data._voiceId || !this.data.voiceOnline) {
      wx.showToast({ title: '请先创建声音', icon: 'none' }); return;
    }
    if (!this.data.customStoryDesc.trim() && !this.data.selectedCategory) {
      wx.showToast({ title: '请选择分类或输入故事描述', icon: 'none' }); return;
    }

    var that = this;
    var category = this.data.selectedCategory || '';
    var desc = this.data.customStoryDesc.trim();
    var wordCount = this.data.storyWordCount;

    this.setData({
      isGenerating: true, generateProgress: 0,
      loadingText: '正在创作故事...', currentStep: 1,
      generatedStory: '', audioChunks: []
    });

    wx.showLoading({ title: '正在创作故事...' });

    dashscope.generateStory(desc, category, wordCount)
      .then(function (text) {
        wx.hideLoading();
        that.setData({
          isGenerating: false, generateProgress: 100,
          loadingText: '完成！', currentStep: 3,
          generatedStory: text, storyExpanded: true
        });
        that.saveToHistory(text);
        console.log('[声伴] 故事生成成功，字数:', text.length);
        wx.showToast({ title: '故事生成完成！', icon: 'success' });
      })
      .catch(function (err) {
        wx.hideLoading();
        that.setData({ isGenerating: false });
        console.error('[声伴] 生成失败:', err);
        wx.showModal({
          title: '生成失败',
          content: String(err.message || err),
          showCancel: false
        });
      });
  },
  },

  // ── 模拟进度 ──
  startProgressSim: function () {
    var that = this;
    var p = 0;
    this._progTimer = setInterval(function () {
      if (!that.data.isGenerating) { clearInterval(that._progTimer); return; }
      if (p < 30) { p += 2; that.setData({ generateProgress: p, loadingText: '正在创作故事...', currentStep: 1 }); }
      else if (p < 60) { p += 1; that.setData({ generateProgress: p, loadingText: '正在合成语音...', currentStep: 2 }); }
      else if (p < 95) { p += 0.5; that.setData({ generateProgress: Math.round(p) }); }
    }, 500);
  },
  stopProgressSim: function () {
    if (this._progTimer) { clearInterval(this._progTimer); this._progTimer = null; }
  },

  // ==================== 播放 ====================
  initAudioPlayer: function () {
    var that = this;
    innerAudioContext.onPlay(function () {
      that.setData({ isPlayingStory: true });
    });
    innerAudioContext.onPause(function () { that.setData({ isPlayingStory: false }); });
    innerAudioContext.onStop(function () {
      that.setData({ isPlayingStory: false, audioCurrentTime: 0, audioCurrentTimeText: '00:00' });
    });
    innerAudioContext.onEnded(function () {
      // 播放下一段
      if (that.data.currentChunkIndex < that.data.audioChunks.length - 1) {
        var nextIdx = that.data.currentChunkIndex + 1;
        that.setData({ currentChunkIndex: nextIdx });
        innerAudioContext.src = that.data.audioChunks[nextIdx];
        innerAudioContext.play();
      } else {
        that.setData({ isPlayingStory: false, audioCurrentTime: 0, audioCurrentTimeText: '00:00' });
      }
    });
    var lastTU = 0;
    innerAudioContext.onTimeUpdate(function () {
      var now = Date.now();
      if (now - lastTU < 500) return;
      lastTU = now;
      var t = Math.floor(innerAudioContext.currentTime);
      that.setData({ audioCurrentTime: t, audioCurrentTimeText: that.formatTime(t) });
    });
    innerAudioContext.onDurationChange(function () {
      var d = Math.floor(innerAudioContext.duration) || 0;
      that.setData({ audioDuration: d, audioDurationText: that.formatTime(d) });
    });
  },

  togglePlayStory: function () {
    if (this.data.isPlayingStory) {
      innerAudioContext.pause();
    } else {
      if (!this.data.audioChunks.length) return;
      innerAudioContext.src = this.data.audioChunks[this.data.currentChunkIndex];
      innerAudioContext.play();
    }
  },

  replayStory: function () {
    innerAudioContext.stop();
    this.setData({ currentChunkIndex: 0 });
    setTimeout(function () {
      innerAudioContext.src = this.data.audioChunks[0];
      innerAudioContext.play();
    }.bind(this), 200);
  },

  onSliderChange: function (e) {
    var t = e.detail.value;
    innerAudioContext.seek(t);
    this.setData({ audioCurrentTime: t, audioCurrentTimeText: this.formatTime(t) });
  },

  onToggleStory: function () {
    this.setData({ storyExpanded: !this.data.storyExpanded });
  },

  saveStory: function () {
    if (!this.data.audioChunks.length) return;
    var fs = wx.getFileSystemManager();
    var savePath = wx.env.USER_DATA_PATH + '/声伴_' + Date.now() + '.mp3';
    try {
      fs.copyFileSync(this.data.audioChunks[0], savePath);
      wx.showToast({ title: '已保存', icon: 'success' });
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // ==================== 历史记录 ====================
  saveToHistory: function (story) {
    var history = wx.getStorageSync('storyHistory') || [];
    var style = this.data.voiceStyles.find(function (s) { return s.id === this.data.selectedVoiceStyle; }.bind(this));
    var cat = this.data.categories.find(function (c) { return c.id === this.data.selectedCategory; });
    history.unshift({
      id: Date.now(),
      story: (story || '').substring(0, 120) + '...',
      fullStory: story || '',
      audioChunks: this.data.audioChunks,
      voiceStyle: style ? style.label : '',
      category: cat ? cat.label : '',
      desc: this.data.customStoryDesc,
      minutes: this.data.storyMinutes,
      time: new Date().toLocaleString()
    });
    if (history.length > 50) history = history.slice(0, 50);
    wx.setStorageSync('storyHistory', history);
  },

  // ==================== 清理 ====================
  stopAllTimers: function () {
    this.stopProgressSim();
    this.stopTimerTicking();
  }
});
