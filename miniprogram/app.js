// app.js - 微信小程序入口
App({
  onLaunch() {
    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    this.globalData.systemInfo = systemInfo;
    this.globalData.statusBarHeight = systemInfo.statusBarHeight;
    this.globalData.screenHeight = systemInfo.screenHeight;
    
    // 从本地存储恢复 API 配置
    const apiUrl = wx.getStorageSync('apiUrl');
    if (apiUrl) {
      this.globalData.apiUrl = apiUrl;
    }
  },

  globalData: {
    systemInfo: null,
    statusBarHeight: 0,
    screenHeight: 0,
    // 后端服务地址（部署后替换）
    apiUrl: 'https://your-backend-url.com',
    // 如果后端还没部署，可以用这个临时地址（需替换）
    // apiUrl: 'http://192.168.x.x:5000'
  }
});
