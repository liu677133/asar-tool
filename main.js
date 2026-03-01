const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
// 引入自带的多线程模块
const { Worker } = require('worker_threads');

function createWindow () {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true, 
      contextIsolation: false
    }
  });
  win.loadFile('index.html');
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ================= 核心业务逻辑 (多线程 + 取消功能) =================

let currentWorker = null; // 用来记录当前正在干活的子线程

// 封装一个给子线程派发任务的函数
function runWorker(workerData) {
  return new Promise((resolve) => {
    currentWorker = new Worker(path.join(__dirname, 'worker.js'), { workerData });
    
    // 成功完成任务
    currentWorker.on('message', (result) => {
      currentWorker = null;
      resolve(result);
    });
    
    // 遇到报错
    currentWorker.on('error', (error) => {
      currentWorker = null;
      resolve({ success: false, msg: error.message });
    });
    
    // 线程退出（如果是被强行杀死的，会触发这个）
    currentWorker.on('exit', (code) => {
      if (currentWorker !== null) { // 如果 currentWorker 还没被清空，说明是被强杀的
        currentWorker = null;
        resolve({ success: false, msg: '操作已被用户强行取消！\n(注意：目标路径下可能会残留部分解压或打包了一半的不完整文件，请手动删除)' });
      }
    });
  });
}

// 监听前端发来的【取消操作】请求
ipcMain.handle('cancel-task', async () => {
  if (currentWorker) {
    await currentWorker.terminate(); // 核心魔法：直接杀死子线程
    currentWorker = null;
    return true; // 告诉前端取消成功
  }
  return false;
});

// 1. 处理【解包】动作
ipcMain.handle('extract-asar', async (event) => {
  const { canceled: openCanceled, filePaths } = await dialog.showOpenDialog({
    title: '第一步：请选择游戏的 app.asar 文件',
    filters: [{ name: 'Asar Archive', extensions: ['asar'] }],
    properties: ['openFile']
  });
  if (openCanceled || filePaths.length === 0) return { success: false, msg: '用户取消了选择' };

  const srcPath = filePaths[0];
  const { canceled: saveCanceled, filePath: destPath } = await dialog.showSaveDialog({
    title: '第二步：请选择解包后的保存位置与文件夹名称',
    defaultPath: path.join(path.dirname(srcPath), 'app_files'),
    buttonLabel: '解压到此处'
  });
  if (saveCanceled || !destPath) return { success: false, msg: '用户取消了选择' };

  return await runWorker({ type: 'extract', src: srcPath, dest: destPath });
});

// 2. 处理【打包】动作
ipcMain.handle('pack-asar', async (event) => {
  const { canceled: openCanceled, filePaths } = await dialog.showOpenDialog({
    title: '第一步：请选择修改完毕的 app_files 文件夹',
    properties: ['openDirectory']
  });
  if (openCanceled || filePaths.length === 0) return { success: false, msg: '用户取消了选择' };

  const srcDir = filePaths[0];
  const { canceled: saveCanceled, filePath: destPath } = await dialog.showSaveDialog({
    title: '第二步：请选择打包后的保存位置与文件名',
    defaultPath: path.join(path.dirname(srcDir), 'app.asar'),
    filters: [{ name: 'Asar Archive', extensions: ['asar'] }],
    buttonLabel: '打包保存'
  });
  if (saveCanceled || !destPath) return { success: false, msg: '用户取消了选择' };

  return await runWorker({ type: 'pack', src: srcDir, dest: destPath });
});