// pages/history/history.js
const app = getApp();
const innerAudioContext = wx.createInnerAudioContext();

Page({
  data: {
    history: [],
    showPlayer: false,
    currentPlay: null,
    isPlaying: false,
    _playingIndex: -1
  },

  onShow() {
    // 每次显示页面时刷新数据
    const history = wx.getStorageSync('storyHistory') || [];
    this.setData({ history });
  },

  onUnload() {
    innerAudioContext.stop();
    innerAudioContext.destroy();
  },

  // 播放历史故事
  playHistory(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.history[index];
    if (!item) return;

    this._playingIndex = index;
    this.setData({
      showPlayer: true,
      currentPlay: item,
      isPlaying: false
    });

    if (item.audioUrl) {
      innerAudioContext.src = item.audioUrl;
      setTimeout(() => {
        innerAudioContext.play();
        this.setData({ isPlaying: true });
      }, 300);
    }
  },

  toggleCurrentPlay() {
    if (this.data.isPlaying) {
      innerAudioContext.pause();
      this.setData({ isPlaying: false });
    } else {
      if (this.data.currentPlay && this.data.currentPlay.audioUrl) {
        innerAudioContext.play();
        this.setData({ isPlaying: true });
      }
    }
  },

  replayCurrent() {
    innerAudioContext.stop();
    if (this.data.currentPlay && this.data.currentPlay.audioUrl) {
      innerAudioContext.play();
      this.setData({ isPlaying: true });
    }
  },

  closePlayer() {
    innerAudioContext.stop();
    this.setData({
      showPlayer: false,
      isPlaying: false,
      currentPlay: null
    });
  },

  // 删除单条记录
  deleteHistory(e) {
    const index = e.currentTarget.dataset.index;
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          let history = this.data.history;
          history.splice(index, 1);
          wx.setStorageSync('storyHistory', history);
          this.setData({ history });
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  // 清空所有记录
  clearAll() {
    wx.showModal({
      title: '确认清空',
      content: '将删除所有历史记录，不可恢复',
      confirmColor: '#ff4d4f',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('storyHistory');
          this.setData({ history: [] });
          wx.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  }
});
