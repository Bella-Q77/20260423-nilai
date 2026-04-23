const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public'));

const scheduledTasks = new Map();

const browsers = {
  chrome: {
    name: 'Google Chrome',
    winPaths: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
    ],
    macPath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    linuxPath: 'google-chrome'
  },
  edge: {
    name: 'Microsoft Edge',
    winPaths: [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ],
    macPath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    linuxPath: 'microsoft-edge'
  },
  firefox: {
    name: 'Mozilla Firefox',
    winPaths: [
      'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
      'C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe'
    ],
    macPath: '/Applications/Firefox.app/Contents/MacOS/firefox',
    linuxPath: 'firefox'
  },
  '360': {
    name: '360安全浏览器',
    winPaths: [
      'C:\\Program Files\\360\\360se6\\Application\\360se.exe',
      'C:\\Program Files (x86)\\360\\360se6\\Application\\360se.exe',
      `${process.env.LOCALAPPDATA}\\360Chrome\\Chrome\\Application\\360chrome.exe`
    ]
  }
};

function getBrowserPath(browserKey) {
  const browser = browsers[browserKey];
  if (!browser) return null;

  const platform = process.platform;
  
  if (platform === 'win32') {
    if (browser.winPaths) {
      for (const winPath of browser.winPaths) {
        try {
          return `"${winPath}"`;
        } catch (e) {
          continue;
        }
      }
    }
  } else if (platform === 'darwin') {
    if (browser.macPath) {
      return `"${browser.macPath}"`;
    }
  } else if (platform === 'linux') {
    if (browser.linuxPath) {
      return browser.linuxPath;
    }
  }
  
  return null;
}

function openUrl(browserKey, url) {
  const platform = process.platform;
  let command;

  if (browserKey === 'default') {
    if (platform === 'win32') {
      command = `start "" "${url}"`;
    } else if (platform === 'darwin') {
      command = `open "${url}"`;
    } else {
      command = `xdg-open "${url}"`;
    }
  } else {
    const browserPath = getBrowserPath(browserKey);
    if (!browserPath) {
      return { success: false, message: `未找到浏览器: ${browsers[browserKey]?.name || browserKey}` };
    }

    if (platform === 'win32') {
      command = `${browserPath} "${url}"`;
    } else if (platform === 'darwin') {
      command = `open -a ${browserPath} "${url}"`;
    } else {
      command = `${browserPath} "${url}"`;
    }
  }

  exec(command, (error) => {
    if (error) {
      console.error(`执行命令失败: ${error}`);
    }
  });

  return { success: true, message: `已打开: ${url}` };
}

function createCronExpression(dateTime) {
  const date = new Date(dateTime);
  if (isNaN(date.getTime())) {
    return null;
  }

  const minute = date.getMinutes();
  const hour = date.getHours();
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const dayOfWeek = '*';

  return `${minute} ${hour} ${day} ${month} ${dayOfWeek}`;
}

app.get('/api/browsers', (req, res) => {
  const availableBrowsers = [{ key: 'default', name: '系统默认浏览器' }];
  
  for (const [key, browser] of Object.entries(browsers)) {
    availableBrowsers.push({ key, name: browser.name });
  }
  
  res.json({ success: true, browsers: availableBrowsers });
});

app.get('/api/tasks', (req, res) => {
  const tasks = [];
  for (const [id, task] of scheduledTasks.entries()) {
    tasks.push({
      id,
      browser: task.browser,
      url: task.url,
      scheduledTime: task.scheduledTime,
      createdAt: task.createdAt
    });
  }
  res.json({ success: true, tasks });
});

app.post('/api/schedule', (req, res) => {
  const { browser, url, scheduledTime } = req.body;

  if (!browser || !url || !scheduledTime) {
    return res.status(400).json({ success: false, message: '缺少必要参数' });
  }

  const scheduledDate = new Date(scheduledTime);
  const now = new Date();
  
  if (scheduledDate <= now) {
    return res.status(400).json({ success: false, message: '定时时间必须大于当前时间' });
  }

  const taskId = Date.now().toString();
  const cronExpression = createCronExpression(scheduledTime);

  if (!cronExpression) {
    return res.status(400).json({ success: false, message: '时间格式无效' });
  }

  const task = cron.schedule(cronExpression, () => {
    console.log(`执行定时任务: ${taskId}`);
    openUrl(browser, url);
    scheduledTasks.delete(taskId);
  }, {
    scheduled: true,
    timezone: 'Asia/Shanghai'
  });

  scheduledTasks.set(taskId, {
    id: taskId,
    browser,
    url,
    scheduledTime,
    createdAt: new Date().toISOString(),
    cronTask: task
  });

  res.json({ 
    success: true, 
    message: '定时任务创建成功',
    task: {
      id: taskId,
      browser,
      url,
      scheduledTime
    }
  });
});

app.delete('/api/tasks/:id', (req, res) => {
  const taskId = req.params.id;
  
  if (!scheduledTasks.has(taskId)) {
    return res.status(404).json({ success: false, message: '任务不存在' });
  }

  const task = scheduledTasks.get(taskId);
  task.cronTask.stop();
  scheduledTasks.delete(taskId);

  res.json({ success: true, message: '任务已取消' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`服务运行在 http://localhost:${PORT}`);
});
