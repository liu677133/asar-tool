const { parentPort, workerData } = require('worker_threads');
const asar = require('asar');

async function doWork() {
    try {
        if (workerData.type === 'extract') {
            // 执行解包操作
            asar.extractAll(workerData.src, workerData.dest);
            parentPort.postMessage({ success: true, destPath: workerData.dest });
        } else if (workerData.type === 'pack') {
            // 执行打包操作
            await asar.createPackage(workerData.src, workerData.dest);
            parentPort.postMessage({ success: true, destPath: workerData.dest });
        }
    } catch (error) {
        // 如果出错，把报错信息发给主线程
        parentPort.postMessage({ success: false, msg: error.message });
    }
}

doWork();