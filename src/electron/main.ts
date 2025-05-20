import { app, BrowserWindow } from 'electron';
import path from 'path';

type test = string;

app.on('ready', () => {
  const maainWindow = new BrowserWindow({});
  maainWindow.loadFile(path.join(app.getAppPath(), '/dist-react/index.html'));
});