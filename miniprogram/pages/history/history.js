// pages/history/history.js — 声伴 v2.0
var audio = null;

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
    if (!audio) audio = wx.createInnerAudioContext();
    var history = wx.getStorageSync('storyHistory') || [];
    this.setData({ history: history });
  },

  onUnload: function () {
    if (audio) {
      audio.offEnded();
      audio.stop();
      audio.destroy();
      audio = null;
    }
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

    // 注册多段音频自动切换
    audio.offEnded();
    var that = this;
    audio.onEnded(function () {
      var idx = that.data.chunkIdx;
      var total = that.data.chunkTotal;
      if (idx < total - 1 && that.data.currentPlay) {
        var nextIdx = idx + 1;
        var chs = that.data.currentPlay.audioChunks || [];
        if (chs[nextIdx]) {
          that.setData({ chunkIdx: nextIdx });
          audio.src = chs[nextIdx];
          audio.play();
        }
      } else {
        that.setData({ isPlaying: false });
      }
    });

    if (chunks.length > 0) {
      audio.src = chunks[0];
      audio.onCanplay(function () {
        audio.play();
        that.setData({ isPlaying: true });
      });
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
