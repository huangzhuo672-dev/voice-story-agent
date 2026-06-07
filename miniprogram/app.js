// app.js - 微信小程序入口
App({
  onLaunch() {
    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    this.globalData.systemInfo = systemInfo;
    this.globalData.statusBarHeight = systemInfo.statusBarHeight;
    this.globalData.screenHeight = systemInfo.screenHeight;

    // 恢复 API Key（从本地存储）
    const apiKey = wx.getStorageSync('apiKey');
    if (apiKey) {
      this.globalData.hasApiKey = true;
    }
  },

  globalData: {
    systemInfo: null,
    statusBarHeight: 0,
    screenHeight: 0,
    hasApiKey: false
  }
});
