// pages/history/history.js — 声伴 v2.0
var app = getApp();
var audio = wx.createInnerAudioContext();

Page({
  data: {
    history: [],
    showPlayer: false,
    currentPlay: null,
    isPlaying: false,
    chunkIdx: 0,
    chunkTotal: 0
  },

  onShow: function () {
    var history = wx.getStorageSync('storyHistory') || [];
    this.setData({ history: history });
  },

  onUnload: function () {
    audio.stop();
    audio.destroy();
  },

  playHistory: function (e) {
    var index = e.currentTarget.dataset.index;
    var item = this.data.history[index];
    if (!item) return;

    var chunks = item.audioChunks || [];
    this.setData({
      showPlayer: true,
      currentPlay: item,
      isPlaying: false,
      chunkIdx: 0,
      chunkTotal: chunks.length || 0
    });

    if (chunks.length > 0) {
      audio.src = chunks[0];
      var that = this;
      setTimeout(function () {
        audio.play();
        that.setData({ isPlaying: true });
      }, 300);
    }
  },

  toggleCurrentPlay: function () {
    if (this.data.isPlaying) {
      audio.pause();
      this.setData({ isPlaying: false });
    } else {
      audio.play();
      this.setData({ isPlaying: true });
    }
  },

  replayCurrent: function () {
    var item = this.data.currentPlay;
    if (!item) return;
    var chunks = item.audioChunks || [];
    if (chunks.length === 0) return;
    audio.stop();
    this.setData({ chunkIdx: 0 });
    var that = this;
    setTimeout(function () {
      audio.src = chunks[0];
      audio.play();
      that.setData({ isPlaying: true });
    }, 200);
  },

  closePlayer: function () {
    audio.stop();
    this.setData({ showPlayer: false, isPlaying: false, currentPlay: null });
  },

  deleteHistory: function (e) {
    var index = e.currentTarget.dataset.index;
    var that = this;
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复',
      confirmColor: '#ff4d4f',
      success: function (res) {
        if (res.confirm) {
          var history = that.data.history;
          history.splice(index, 1);
          wx.setStorageSync('storyHistory', history);
          that.setData({ history: history });
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  clearAll: function () {
    var that = this;
    wx.showModal({
      title: '确认清空',
      content: '将删除所有历史记录',
      confirmColor: '#ff4d4f',
      success: function (res) {
        if (res.confirm) {
          wx.removeStorageSync('storyHistory');
          that.setData({ history: [] });
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  }
});

// 处理多段音频的自动切换
(function () {
  audio.onEnded(function () {
    // 获取当前页面
    var pages = getCurrentPages();
    if (pages.length === 0) return;
    var page = pages[pages.length - 1];
    if (page.route !== 'pages/history/history') return;

    var chunkIdx = page.data.chunkIdx;
    var chunkTotal = page.data.chunkTotal;
    if (chunkIdx < chunkTotal - 1 && page.data.currentPlay) {
      var nextIdx = chunkIdx + 1;
      var chunks = page.data.currentPlay.audioChunks || [];
      if (chunks[nextIdx]) {
        page.setData({ chunkIdx: nextIdx });
        audio.src = chunks[nextIdx];
        audio.play();
      }
    } else {
      page.setData({ isPlaying: false });
    }
  });
})();
